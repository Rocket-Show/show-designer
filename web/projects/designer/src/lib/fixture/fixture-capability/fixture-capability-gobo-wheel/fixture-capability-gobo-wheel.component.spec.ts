import { FixturePixelGroupResolveService } from '../../../services/fixture-pixel-group-resolve.service';
import { FixtureProfile } from '../../../models/fixture-profile';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
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
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    // the patterns open on their own once per gobo and app: anew for each case
    FixtureCapabilityGoboWheelComponent['offered'].clear();

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

  it('starts on the first slot when switched on, and keeps the slot when switched off', async () => {
    component.changeActive(true);
    await update();
    expect(component.getCurrentSlotNumber()).toBe(1);
    expect(selected()).toEqual(['1 Open']);

    component.selectSlotNumber(2);
    component.changeActive(false);
    await update();
    expect(component.isActive()).toBe(false);
    expect(step.fixtureCapabilityValues.map((value) => [value.slotNumber, value.deactivated])).toEqual([[2, true]]);

    // on again at the same slot
    component.changeActive(true);
    await update();
    expect(component.isActive()).toBe(true);
    expect(component.getCurrentSlotNumber()).toBe(2);
  });

  it('shakes the gobo picked, if it can, and carries the shake over to another one which can', async () => {
    component.selectSlotNumber(1);
    await update();
    expect(component.canShake()).toBe(false);
    expect(element.querySelector('.gobo-shake')).toBeNull();

    component.selectSlotNumber(2);
    await update();
    expect(component.canShake()).toBe(true);
    expect(element.querySelector('.gobo-shake')).not.toBeNull();
    expect(component.getShake()).toBe(0);

    component.setShake(0.6);
    const shake = presetService.getCapabilityValue(step, FixtureCapabilityType.WheelShake, undefined, 'Gobo Wheel', 'spot');
    expect([shake.valuePercentage, shake.slotNumber]).toEqual([0.6, 2]);

    // beyond what a shake can be
    component.setShake(2);
    component.setShake('fast');
    expect(component.getShake()).toBe(0.6);

    // a gobo which can't shake stops it
    component.selectSlotNumber(3);
    expect(component.getShake()).toBe(0);

    component.selectSlotNumber(2);
    component.setShake(0.4);

    // off with its shake, on again with it
    component.changeActive(false);
    expect(step.fixtureCapabilityValues.every((value) => value.deactivated)).toBe(true);
    component.changeActive(true);
    expect(step.fixtureCapabilityValues.some((value) => value.deactivated)).toBe(false);
    expect(component.getShake()).toBe(0.4);

    // shaking a gobo switched off switches it on
    component.changeActive(false);
    component.setShake(0.5);
    expect(component.isActive()).toBe(true);
  });
  describe('the pattern the preview shows a gobo with', () => {
    function slot(index: number): HTMLElement {
      return element.querySelectorAll('.list-group-item')[index] as HTMLElement;
    }

    function picker(): HTMLElement {
      return element.querySelector('.gobo-picker');
    }

    function choices() {
      return TestBed.inject(ProjectService).project.goboPatterns.map((choice) => ({ ...choice }));
    }

    it('shows the pattern of each gobo next to it, drawn', () => {
      expect(slot(0).querySelector('canvas')).toBeNull();

      const thumbs = Array.from(element.querySelectorAll<HTMLCanvasElement>('.list-group-item canvas.gobo-thumb'));
      expect(thumbs.length).toBe(2);
      // the star is a star
      expect(thumbs[0].dataset.key.startsWith('star:')).toBe(true);
      expect(thumbs.every((thumb) => !!thumb.dataset.drawn)).toBe(true);
    });

    it('opens the patterns the first time a gobo without a pattern matched to it is picked, and not again', async () => {
      slot(1).click();
      await update();

      expect(picker()).not.toBeNull();
      expect(picker().querySelectorAll('.gobo-picker-tile').length).toBe(component.catalog.length + 1);
      // what its name brings is what it shows so far
      expect(picker().querySelector('.gobo-picker-tile.active').textContent.trim()).toBe('designer.fixture.capability-gobo-pattern-auto');

      component.closePicker();
      slot(0).click();
      await update();
      expect(picker()).toBeNull();
      expect(element.querySelector('.gobo-look')).toBeNull();

      slot(1).click();
      await update();
      expect(picker()).toBeNull();
      expect(element.querySelector('.gobo-look')).not.toBeNull();

      // another gobo of the wheel
      slot(2).click();
      await update();
      expect(picker()).not.toBeNull();
    });

    it('shows the gobo with the pattern picked on all fixtures of the model, and with the one its name brings again', async () => {
      slot(1).click();
      await update();

      (picker().querySelector('[data-pattern="dots-7"]') as HTMLElement).click();
      await update();

      expect(picker()).toBeNull();
      expect(choices()).toEqual([{ profileUuid: 'spot', wheel: 'Gobo Wheel', slotNumber: 2, pattern: 'dots-7' }]);
      expect(element.querySelector('.gobo-look-toggle').textContent.trim()).toBe('designer.fixture.gobo-family.dots 7');
      expect(element.querySelectorAll<HTMLCanvasElement>('canvas.gobo-thumb')[0].dataset.key.startsWith('dots:7:')).toBe(true);

      // picked again: the one picked last
      (element.querySelector('.gobo-look-toggle') as HTMLElement).click();
      await update();
      expect(picker().querySelector('.gobo-picker-tile.active').getAttribute('data-pattern')).toBe('dots-7');
      (picker().querySelector('[data-pattern="spiral-3"]') as HTMLElement).click();
      await update();
      expect(choices().map((choice) => choice.pattern)).toEqual(['spiral-3']);

      // back to what its name brings
      (element.querySelector('.gobo-look-toggle') as HTMLElement).click();
      await update();
      (picker().querySelector('.gobo-picker-tile') as HTMLElement).click();
      await update();
      expect(choices()).toEqual([]);
      expect(element.querySelector('.gobo-look-toggle').textContent.trim()).toBe('designer.fixture.capability-gobo-pattern-auto');
    });

    it('closes the patterns with Escape and with a click elsewhere, drawing the card anew', async () => {
      slot(1).click();
      await update();
      expect(picker()).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // drawn anew by the card itself, not by a change detection of the test
      expect(picker()).toBeNull();

      (element.querySelector('.gobo-look-toggle') as HTMLElement).click();
      await update();
      expect(picker()).not.toBeNull();

      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(picker()).toBeNull();
    });

    it('names the patterns by their kind and how many points, dots, lines, ... they have', () => {
      expect(component.getPatternName('star-5')).toBe('designer.fixture.gobo-family.star 5');
      // the ones without a count to tell are numbered
      expect(component.getPatternName('breakup-32')).toBe('designer.fixture.gobo-family.breakup 2');
      expect(component.getPatternName('unknown')).toBe('');
    });
  });

  it('turns the gobos of its own wheel at a speed or to an angle, leaving a rotation of all wheels alone', async () => {
    // no channel turning the wheel: nothing to turn
    expect(component.canRotate()).toBe(false);

    const rotation = new FixtureService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new FixturePixelGroupResolveService()
    ).getCachedChannels(
      new FixtureProfile({
        uuid: 'spot',
        availableChannels: {
          Rotation: {
            capabilities: [
              { dmxRange: [0, 127], type: 'WheelSlotRotation', wheel: 'Gobo Wheel', speedStart: 'slow CW', speedEnd: 'fast CW' },
              { dmxRange: [128, 255], type: 'WheelSlotRotation', wheel: 'Gobo Wheel', angleStart: '0deg', angleEnd: '360deg' },
            ],
          },
        },
        modes: [{ name: 'Mode', shortName: 'mode', channels: ['Rotation'] }],
      }),
      new FixtureProfile({ modes: [{ name: 'Mode', shortName: 'mode', channels: ['Rotation'] }] }).modes[0],
      null
    );
    fixture.componentRef.setInput('fixtureChannels', [...spot.channels, ...rotation]);
    await update();
    expect(component.canRotate()).toBe(true);
    expect(component.canIndex()).toBe(true);
    expect(component.getRotation()).toBe(0.5);

    // a rotation of all wheels, which this one leaves alone
    presetService.setCapabilityValue(step, FixtureCapabilityType.WheelSlotRotation, 0.1);

    component.setRotation(0.8);
    component.setAngle(90);
    const own = presetService.getExactCapabilityValue(step, FixtureCapabilityType.WheelSlotRotation, 'Gobo Wheel', 'spot');
    expect(own.valueDegrees).toBe(90);
    expect(own.valuePercentage).toBeUndefined();
    expect(component.getAngle()).toBe(90);
    expect(presetService.getCapabilityValue(step, FixtureCapabilityType.WheelSlotRotation).valuePercentage).toBe(0.1);

    component.stopRotation();
    expect(component.isRotating()).toBe(false);
    expect(step.fixtureCapabilityValues.length).toBe(1);
  });
});
