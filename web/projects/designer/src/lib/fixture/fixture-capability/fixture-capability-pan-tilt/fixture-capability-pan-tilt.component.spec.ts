import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { Preset } from '../../../models/preset';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { FixtureCapabilityPanTiltComponent } from './fixture-capability-pan-tilt.component';

// Where the step being edited points the moving heads, typed in percent or set with the
// sliders, and whether the preset mirrors either axis.
describe('FixtureCapabilityPanTiltComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityPanTiltComponent>;
  let component: FixtureCapabilityPanTiltComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let preset: Preset;
  let previewLive: jasmine.Spy;
  let capabilityValuesChanged: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityPanTiltComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    preset = new Preset({ uuid: 'move', steps: [{ uuid: 'step' }] });
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;
    presetService.selectedStep = preset.steps[0];

    capabilityValuesChanged = jasmine.createSpy('capabilityValuesChanged');
    presetService.capabilityValuesChanged.subscribe(capabilityValuesChanged);

    fixture = TestBed.createComponent(FixtureCapabilityPanTiltComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    await update();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function activeCheckbox(): HTMLInputElement {
    return element.querySelector('.card-header input');
  }

  // the pan and the tilt
  function inputs(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input.sd-value-input'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function value(type: FixtureCapabilityType): number {
    return presetService.getCapabilityValue(presetService.selectedStep, type)?.valuePercentage;
  }

  it('is off while the step leaves the position alone', () => {
    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(activeCheckbox().checked).toBe(false);
    expect(inputs().map((input) => input.value)).toEqual(['0', '0']);
  });

  it('shows the position of the step in percent', async () => {
    presetService.setCapabilityValue(presetService.selectedStep, FixtureCapabilityType.Pan, 0.12345);
    presetService.setCapabilityValue(presetService.selectedStep, FixtureCapabilityType.Tilt, 0.75);
    await update();

    expect(element.querySelector('.card').classList).not.toContain('capability-deactivated');
    expect(activeCheckbox().checked).toBe(true);
    expect(inputs().map((input) => input.value)).toEqual(['12.35', '75']);
  });

  it('points the fixtures at the percentages typed in', () => {
    type(inputs()[0], '20');
    type(inputs()[1], '80');

    expect(value(FixtureCapabilityType.Pan)).toBe(0.2);
    expect(value(FixtureCapabilityType.Tilt)).toBe(0.8);
    expect(previewLive).toHaveBeenCalled();
  });

  it('keeps the position for anything which is no percentage', () => {
    type(inputs()[0], '20');
    type(inputs()[1], '80');

    for (const typed of ['abc', '101', '-1']) {
      type(inputs()[0], typed);
      type(inputs()[1], typed);
    }

    expect(value(FixtureCapabilityType.Pan)).toBe(0.2);
    expect(value(FixtureCapabilityType.Tilt)).toBe(0.8);
  });

  it('points the fixtures with the sliders', () => {
    component.setValuePan(0.1);
    component.setValueTilt(0.9);

    expect(value(FixtureCapabilityType.Pan)).toBe(0.1);
    expect(value(FixtureCapabilityType.Tilt)).toBe(0.9);
  });

  it('switches on pointing straight ahead, and off again', async () => {
    activeCheckbox().click();

    expect(value(FixtureCapabilityType.Pan)).toBe(0.5);
    expect(value(FixtureCapabilityType.Tilt)).toBe(0.5);

    await update();
    activeCheckbox().click();

    expect(presetService.selectedStep.fixtureCapabilityValues).toEqual([]);
  });

  it('mirrors the pan and the tilt of the whole preset', async () => {
    (element.querySelector('#capabilityPanTiltMirrorPan') as HTMLInputElement).click();

    expect(preset.mirrorPan).toBe(true);
    expect(preset.mirrorTilt).toBe(false);

    // the channels show what the capabilities put on them
    expect(capabilityValuesChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();

    (element.querySelector('#capabilityPanTiltMirrorTilt') as HTMLInputElement).click();
    expect(preset.mirrorTilt).toBe(true);

    await update();
    expect((element.querySelector('#capabilityPanTiltMirrorPan') as HTMLInputElement).checked).toBe(true);
    expect((element.querySelector('#capabilityPanTiltMirrorTilt') as HTMLInputElement).checked).toBe(true);
  });

  it('mirrors nothing while no preset is being edited', () => {
    presetService.selectedPreset = undefined;

    component.setMirrorPan(true);
    component.setMirrorTilt(true);

    expect(component.getMirrorPan()).toBe(false);
    expect(component.getMirrorTilt()).toBe(false);
    expect(preset.mirrorPan).toBe(false);
    expect(capabilityValuesChanged).not.toHaveBeenCalled();
  });

  it('shows nothing while no step is being edited', () => {
    presetService.selectedStep = undefined;

    expect(component.getValueTextPan()).toBeUndefined();
    expect(component.getValueTextTilt()).toBeUndefined();
  });
});
