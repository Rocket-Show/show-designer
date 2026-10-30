import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { CachedFixture } from '../../../models/cached-fixture';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { PresetStep } from '../../../models/preset-step';
import { Project } from '../../../models/project';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureCapabilityGoboWheelComponent } from './fixture-capability-gobo-wheel.component';

// The gobo wheel of a profile in the preset: the step being edited picks one of its slots, which only fixtures of this
// profile play
describe('FixtureCapabilityGoboWheelComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityGoboWheelComponent>;
  let component: FixtureCapabilityGoboWheelComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let step: PresetStep;
  let spot: CachedFixture;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityGoboWheelComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    // an open slot, two gobos and a split between them, which can't be picked here
    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        {
          uuid: 'spot',
          name: 'Spot',
          availableChannels: {
            Gobo: {
              capabilities: [
                { dmxRange: [0, 9], type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 1 },
                { dmxRange: [10, 19], type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 2 },
                { dmxRange: [20, 29], type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 2.5 },
                { dmxRange: [30, 39], type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 3 },
                { dmxRange: [40, 255], type: 'WheelShake', wheel: 'Gobo Wheel', slotNumber: 2 },
              ],
            },
          },
          wheels: { 'Gobo Wheel': { slots: [{ type: 'Open' }, { type: 'Gobo', name: 'Star' }, { type: 'Gobo' }] } },
          modes: [{ name: '1-channel', shortName: '1ch', channels: ['Gobo'] }],
        },
      ],
      fixtures: [{ uuid: 'spot', profileUuid: 'spot', modeShortName: '1ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 }],
      presetFixtures: [{ fixtureUuid: 'spot' }],
    });
    const fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    spot = fixtureService.cachedFixtures[0];

    step = new PresetStep({ uuid: 'step' });
    presetService = TestBed.inject(PresetService);
    presetService.selectedStep = step;

    fixture = TestBed.createComponent(FixtureCapabilityGoboWheelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('profile', spot.profile);
    fixture.componentRef.setInput('channel', spot.channels[0]);
    await update();
  });

  afterEach(() => fixture.destroy());

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function slots(): string[] {
    return Array.from(element.querySelectorAll('.list-group-item')).map((slot) => slot.textContent.trim());
  }

  function selected(): string[] {
    return Array.from(element.querySelectorAll('.list-group-item.active')).map((slot) => slot.textContent.trim());
  }

  it('lists the slots of its wheel by their gobos, the open one by its kind', () => {
    expect(component.wheelName).toBe('Gobo Wheel');
    expect(slots()).toEqual(['1 Open', '2 Star', '3']);
    expect(selected()).toEqual([]);
    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
  });

  it('picks a gobo for the fixtures of its profile', async () => {
    (element.querySelectorAll('.list-group-item')[1] as HTMLElement).click();
    await update();

    const value = presetService.getCapabilityValue(step, FixtureCapabilityType.WheelSlot, undefined, 'Gobo Wheel', 'spot');
    expect(value.slotNumber).toBe(2);
    expect(value.profileUuid).toBe('spot');
    expect(selected()).toEqual(['2 Star']);
    expect(previewLive).toHaveBeenCalled();
  });

  it('starts on the first slot when switched on, and leaves the wheel alone when switched off', async () => {
    component.changeActive(true);
    await update();
    expect(component.getCurrentSlotNumber()).toBe(1);
    expect(selected()).toEqual(['1 Open']);

    component.changeActive(false);
    await update();
    expect(step.fixtureCapabilityValues).toEqual([]);
    expect(selected()).toEqual([]);
  });
});
