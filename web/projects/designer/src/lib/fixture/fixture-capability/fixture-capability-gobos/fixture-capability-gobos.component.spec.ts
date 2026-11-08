import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureProfile } from '../../../models/fixture-profile';
import { PresetStep } from '../../../models/preset-step';
import { FixturePixelGroupResolveService } from '../../../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { FixtureCapabilityGobosComponent } from './fixture-capability-gobos.component';

// two models with a gobo wheel each: both have the open slot and a gobo named "Star", only the first one "Dots"
function wheelOf(uuid: string, slots: any[]) {
  const profile = new FixtureProfile({
    uuid,
    name: uuid,
    wheels: { Gobos: { slots } },
    availableChannels: {
      Gobos: {
        capabilities: slots.map((slot, index) => ({ dmxRange: [index * 10, index * 10 + 9], type: 'WheelSlot', slotNumber: index + 1 })),
      },
    },
    modes: [{ name: 'Mode', shortName: 'mode', channels: ['Gobos'] }],
  });
  const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

  return { profile, channel: fixtureService.getCachedChannels(profile, profile.modes[0], null)[0] };
}

describe('FixtureCapabilityGobosComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityGobosComponent>;
  let component: FixtureCapabilityGobosComponent;
  let presetService: PresetService;
  let step: PresetStep;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityGobosComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    presetService = TestBed.inject(PresetService);
    step = new PresetStep({ uuid: 'step' });
    presetService.selectedStep = step;

    fixture = TestBed.createComponent(FixtureCapabilityGobosComponent);
    component = fixture.componentInstance;
    component.wheels = [
      wheelOf('spot-a', [{ type: 'Open' }, { type: 'Gobo', name: 'Dots' }, { type: 'Gobo', name: 'Star' }]),
      wheelOf('spot-b', [{ type: 'Open' }, { type: 'Gobo', name: 'Star' }]),
    ];
    fixture.detectChanges();
  });

  function slot(profileUuid: string): number {
    return presetService.getCapabilityValue(step, FixtureCapabilityType.WheelSlot, undefined, 'Gobos', profileUuid)?.slotNumber;
  }

  it('picks a gobo on the wheel of every model showing it, leaving the others alone', () => {
    const gobos = component.gobos;
    expect(gobos.length).toBe(3);
    expect(gobos.map((gobo) => component.getModelCount(gobo))).toEqual([2, 1, 2]);
    expect(component.modelCount).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.gobos-tile').length).toBe(3);

    // the star on both wheels, at its own slot on each
    component.pick(gobos[2]);
    expect([slot('spot-a'), slot('spot-b')]).toEqual([3, 2]);
    expect(component.isPicked(gobos[2])).toBe(true);

    // the dots on the first one only, the second one keeps its star
    component.pick(gobos[1]);
    expect([slot('spot-a'), slot('spot-b')]).toEqual([2, 2]);
    expect(component.isPicked(gobos[2])).toBe(false);

    // all of them open
    component.pick(gobos[0]);
    expect([slot('spot-a'), slot('spot-b')]).toEqual([1, 1]);
  });
});
