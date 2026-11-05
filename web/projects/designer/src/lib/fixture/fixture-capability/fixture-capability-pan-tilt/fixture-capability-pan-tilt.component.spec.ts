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
import { FixtureCapabilityValue } from '../../../models/fixture-capability-value';
import { FixtureProfile } from '../../../models/fixture-profile';
import { Preset } from '../../../models/preset';
import { PresetFixture } from '../../../models/preset-fixture';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { PreviewService } from '../../../services/preview.service';
import { FixtureCapabilityPanTiltComponent } from './fixture-capability-pan-tilt.component';

// Where the step being edited points the moving heads: dragged in the square or typed in, in degrees from the middle,
// fanned out, aimed at a spot on the stage, and whether the preset mirrors either axis.
describe('FixtureCapabilityPanTiltComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityPanTiltComponent>;
  let component: FixtureCapabilityPanTiltComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let previewService: PreviewService;
  let preset: Preset;
  let previewLive: jasmine.Spy;

  const pan = FixtureCapabilityType.Pan;
  const tilt = FixtureCapabilityType.Tilt;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityPanTiltComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    previewService = TestBed.inject(PreviewService);

    preset = new Preset({ uuid: 'move', steps: [{ uuid: 'step' }] });
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;
    presetService.selectedStep = preset.steps[0];

    fixture = TestBed.createComponent(FixtureCapabilityPanTiltComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    await update();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function value(type: FixtureCapabilityType): FixtureCapabilityValue {
    return presetService.getCapabilityValue(presetService.selectedStep, type);
  }

  function input(name: string): HTMLInputElement {
    return element.querySelector(`input[name="${name}"]`);
  }

  function pad(): SVGSVGElement {
    return element.querySelector('svg.pan-tilt-pad');
  }

  // a pointer event on the square, at a part of its width and height
  function pointer(type: string, x: number, y: number): PointerEvent {
    const bounds = pad().getBoundingClientRect();
    const event = new PointerEvent(type, {
      clientX: bounds.left + bounds.width * x,
      clientY: bounds.top + bounds.height * y,
      pointerId: 1,
      bubbles: true,
    });
    pad().dispatchEvent(event);

    return event;
  }

  it('is off while the step leaves the position alone', () => {
    expect(component.isActive()).toBe(false);
    expect((element.querySelector('#capabilityPanTiltActive') as HTMLInputElement).checked).toBe(false);
    expect(element.querySelector('.pan-tilt-point')).toBeNull();
    expect(component.getDegreesText(pan)).toBe(0);
  });

  it('switches on pointing straight ahead, and off again', async () => {
    component.changeActive(true);
    await update();

    expect(value(pan).valueDegrees).toBe(0);
    expect(value(tilt).valueDegrees).toBe(0);
    expect(element.querySelector('.pan-tilt-point')).not.toBeNull();

    component.changeActive(false);
    expect(value(pan)).toBeUndefined();
    expect(value(tilt)).toBeUndefined();
    expect(previewLive).toHaveBeenCalled();
  });

  it('points the heads at the degrees typed in, as far as they reach', async () => {
    const panInput = input('panDegrees');
    panInput.value = '90';
    panInput.dispatchEvent(new Event('input'));
    input('tiltDegrees').value = '-500';
    input('tiltDegrees').dispatchEvent(new Event('input'));
    await update();

    expect(value(pan).valueDegrees).toBe(90);
    expect(value(pan).valuePercentage).toBeUndefined();
    // the tilt reaches 135° to either side
    expect(value(tilt).valueDegrees).toBe(-135);

    // anything which is no number leaves the position alone
    component.setDegrees(pan, 'left');
    component.setDegrees(pan, '');
    expect(value(pan).valueDegrees).toBe(90);
  });

  it('shows a position of a project before the degrees on the widest of the heads', () => {
    presetService.setCapabilityValue(presetService.selectedStep, pan, 0.75);

    expect(component.getDegrees(pan)).toBe(135);
    expect(component.getDegrees(tilt)).toBeUndefined();
  });

  it('points the heads with the square: across for the pan, up for the tilt', async () => {
    await update();

    pointer('pointerdown', 1, 0);
    expect(value(pan).valueDegrees).toBe(270);
    expect(value(tilt).valueDegrees).toBe(135);

    pointer('pointermove', 0.5, 0.75);
    expect(value(pan).valueDegrees).toBe(0);
    expect(value(tilt).valueDegrees).toBe(-67.5);

    pointer('pointerup', 0, 0);
    pointer('pointermove', 0, 0);
    expect(value(pan).valueDegrees).toBe(0);
    await update();

    expect(component.getPadX()).toBe(100);
    expect(component.getPadY()).toBe(150);
  });

  it('moves the position with the arrow keys and centres it with a double click', async () => {
    component.padKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    component.padKey(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true }));
    component.padKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(value(pan).valueDegrees).toBe(1);
    expect(value(tilt).valueDegrees).toBe(10);

    component.padKey(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
    component.padKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(value(pan).valueDegrees).toBe(-9);
    expect(value(tilt).valueDegrees).toBe(9);

    pad().dispatchEvent(new MouseEvent('dblclick'));
    expect(value(pan).valueDegrees).toBe(0);
    expect(value(tilt).valueDegrees).toBe(0);
  });

  it('reaches as far as the widest moving head of the preset', () => {
    const profile = new FixtureProfile({
      uuid: 'wide',
      availableChannels: {
        Pan: { capability: { type: 'Pan', angleStart: '0deg', angleEnd: '630deg' } },
        Tilt: { capability: { type: 'Tilt', angleStart: '0deg', angleEnd: '180deg' } },
      },
      modes: [{ name: 'Mode', shortName: 'mode', channels: ['Pan', 'Tilt'] }],
    });
    const cached = new CachedFixture();
    cached.channels = TestBed.inject(FixtureService).getCachedChannels(profile, profile.modes[0], null);
    spyOn(TestBed.inject(FixtureService), 'getCachedFixtureByUuid').and.returnValue(cached);

    preset.fixtures = [new PresetFixture({ fixtureUuid: 'wide' })];
    presetService.fixtureSelectionChanged.next();

    expect(component.panRange).toBe(630);
    expect(component.tiltRange).toBe(180);
  });

  it('fans the heads out, around the middle if they point nowhere yet', async () => {
    input('panSpread').value = '120';
    input('panSpread').dispatchEvent(new Event('input'));
    await update();

    expect(value(pan).spreadDegrees).toBe(120);
    expect(value(pan).valueDegrees).toBe(0);
    expect(component.getSpread(pan)).toBe(120);
    expect(component.getSpread(tilt)).toBe(0);

    component.setSpread(pan, 'wide');
    expect(value(pan).spreadDegrees).toBe(120);

    // no fan
    component.setSpread(pan, 0);
    expect(value(pan).spreadDegrees).toBeUndefined();
  });

  it('aims the heads at a spot picked in the 3D preview, and points them where they pointed before', async () => {
    component.setDegrees(pan, 30);
    expect(component.isAiming()).toBe(false);

    (element.querySelector('button[name="pickSpot"]') as HTMLButtonElement).click();
    expect(previewService.pickingSpot).toBe(true);
    expect(component.isPickingSpot()).toBe(true);

    previewService.spotPicked.next([100, 30, -50]);
    await update();

    expect(component.isAiming()).toBe(true);
    expect([value(pan).aimX, value(pan).aimY, value(pan).aimZ]).toEqual([100, 30, -50]);
    expect([value(tilt).aimX, value(tilt).aimY, value(tilt).aimZ]).toEqual([100, 30, -50]);
    // where the tilt points again once they stop aiming
    expect(value(tilt).valueDegrees).toBe(0);
    expect(component.getAim(2)).toBe(-50);

    // the spot moved along an axis
    input('aim1').value = '120';
    input('aim1').dispatchEvent(new Event('input'));
    expect(value(pan).aimY).toBe(120);
    expect(value(tilt).aimY).toBe(120);
    component.setAim(0, 'far');
    expect(value(pan).aimX).toBe(100);

    (element.querySelector('button[name="stopAiming"]') as HTMLButtonElement).click();
    await update();

    expect(component.isAiming()).toBe(false);
    expect(value(pan).aimX).toBeUndefined();
    expect(value(pan).valueDegrees).toBe(30);
    expect(element.querySelector('button[name="stopAiming"]')).toBeNull();

    // a spot without a step to aim with, or no spot at all
    component.aimAt([1, Number.NaN, 2]);
    expect(component.isAiming()).toBe(false);
    component.setAim(0, 5);
    expect(component.isAiming()).toBe(false);
  });

  it('stops aiming once the heads are pointed by hand, and picking a spot when it is gone', () => {
    component.aimAt([0, 0, 0]);
    expect(component.isAiming()).toBe(true);

    component.setDegrees(tilt, 20);
    expect(component.isAiming()).toBe(false);
    expect(value(tilt).valueDegrees).toBe(20);

    component.pickSpot();
    fixture.destroy();
    expect(previewService.pickingSpot).toBe(false);
  });

  it('mirrors the pan and the tilt of the whole preset', async () => {
    const capabilityValuesChanged = jasmine.createSpy('capabilityValuesChanged');
    presetService.capabilityValuesChanged.subscribe(capabilityValuesChanged);

    (element.querySelector('#capabilityPanTiltMirrorPan') as HTMLInputElement).click();
    await update();
    expect(preset.mirrorPan).toBe(true);
    expect(component.getMirrorPan()).toBe(true);

    component.setMirrorTilt(true);
    expect(preset.mirrorTilt).toBe(true);
    expect(component.getMirrorTilt()).toBe(true);
    expect(capabilityValuesChanged).toHaveBeenCalled();
  });

  it('changes nothing while no preset or step is being edited', () => {
    presetService.selectedPreset = undefined;
    presetService.selectedStep = undefined;

    component.setMirrorPan(true);
    component.setMirrorTilt(true);
    component.setDegrees(pan, 10);
    component.aimAt([1, 2, 3]);

    expect(component.getMirrorPan()).toBe(false);
    expect(component.getMirrorTilt()).toBe(false);
    expect(component.isActive()).toBe(false);
    expect(component.getDegrees(pan)).toBeUndefined();
  });
});
