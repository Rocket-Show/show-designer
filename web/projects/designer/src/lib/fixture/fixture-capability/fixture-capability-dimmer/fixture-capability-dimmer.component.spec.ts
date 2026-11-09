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
import { PresetStep } from '../../../models/preset-step';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { FixtureCapabilityDimmerComponent } from './fixture-capability-dimmer.component';
import { FixtureCapabilityFanComponent } from '../fixture-capability-fan/fixture-capability-fan.component';
import { FanStop } from '../../../models/fan-stop';

// The dimmer of the step being edited, typed in percent or set with its slider. Switched off,
// the step leaves the brightness of the fixtures alone.
describe('FixtureCapabilityDimmerComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityDimmerComponent>;
  let component: FixtureCapabilityDimmerComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let step: PresetStep;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityDimmerComponent, FixtureCapabilityFanComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    step = new PresetStep({ uuid: 'step' });
    presetService = TestBed.inject(PresetService);
    presetService.selectedStep = step;

    fixture = TestBed.createComponent(FixtureCapabilityDimmerComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    await update();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function checkbox(): HTMLInputElement {
    return element.querySelector('#capabilityDimmerActive');
  }

  function input(): HTMLInputElement {
    return element.querySelector('input.sd-value-input');
  }

  function type(value: string) {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  }

  function intensity(): number {
    return presetService.getCapabilityValue(step, FixtureCapabilityType.Intensity)?.valuePercentage;
  }

  it('is off while the step leaves the brightness alone', () => {
    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(checkbox().checked).toBe(false);
    expect(input().value).toBe('0');
    expect(component.getValue()).toBeUndefined();
  });

  it('shows the brightness of the step in percent', async () => {
    presetService.setCapabilityValue(step, FixtureCapabilityType.Intensity, 0.12345);
    await update();

    expect(element.querySelector('.card').classList).not.toContain('capability-deactivated');
    expect(checkbox().checked).toBe(true);
    expect(input().value).toBe('12.35');
  });

  it('dims to the percentage typed in', () => {
    type('40');

    expect(intensity()).toBe(0.4);
    expect(previewLive).toHaveBeenCalled();
  });

  it('keeps its value for anything which is no percentage', () => {
    type('40');

    for (const typed of ['abc', '101', '-1']) {
      type(typed);
    }

    expect(intensity()).toBe(0.4);
  });

  it('dims with the slider', () => {
    component.setValue(0.25);

    expect(intensity()).toBe(0.25);
  });

  it('switches on at full brightness, and off again', async () => {
    checkbox().click();
    expect(intensity()).toBe(1);

    await update();
    checkbox().click();
    await update();

    // off, the step keeps the brightness, shown greyed out, but doesn't play it
    expect(step.fixtureCapabilityValues.length).toBe(1);
    expect(step.fixtureCapabilityValues[0].deactivated).toBe(true);
    expect(checkbox().checked).toBe(false);
    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(input().value).toBe('100');
    expect(previewLive).toHaveBeenCalled();
  });

  it('switches on again as it was, after it was switched off', async () => {
    presetService.setCapabilityFan(step, FixtureCapabilityType.Intensity, [
      new FanStop({ position: 0, valuePercentage: 0.2 }),
      new FanStop({ position: 1, valuePercentage: 0.6 }),
    ]);
    await update();

    checkbox().click();
    await update();
    checkbox().click();
    await update();

    expect(checkbox().checked).toBe(true);
    expect(step.fixtureCapabilityValues[0].deactivated).toBeUndefined();
    expect(step.fixtureCapabilityValues[0].fan.map((stop) => stop.valuePercentage)).toEqual([0.2, 0.6]);
  });

  it('switches on with a change of the brightness', async () => {
    component.setValue(0.3);
    component.changeActive(false);

    component.setValue(0.5);
    await update();

    expect(checkbox().checked).toBe(true);
    expect(intensity()).toBe(0.5);
  });

  it('shows nothing while no step is being edited', () => {
    presetService.selectedStep = undefined;

    expect(component.getValue()).toBeUndefined();
    expect(component.getValueText()).toBeUndefined();
  });

  it('fans the dimmer out over the fixtures of the preset, from the first to the last one or from the middle', async () => {
    presetService.setCapabilityValue(step, FixtureCapabilityType.Intensity, 0.8);
    await update();

    (element.querySelector('button[name="fan"]') as HTMLButtonElement).click();
    await update();

    // from none on the first fixture to what it was on the last one, saved as the one in the middle
    const fanned = presetService.getCapabilityValue(step, FixtureCapabilityType.Intensity);
    expect(fanned.fan.map((stop) => [stop.position, stop.valuePercentage])).toEqual([
      [0, 0],
      [1, 0.8],
    ]);
    expect(fanned.valuePercentage).toBeCloseTo(0.4, 12);
    expect(component.isFanned()).toBe(true);
    expect(previewLive).toHaveBeenCalled();

    // each end on a field (and a slider) of its own
    const ends = Array.from(element.querySelectorAll('input.fan-value')) as HTMLInputElement[];
    expect(ends.map((end) => end.value)).toEqual(['0', '80']);
    ends[0].value = '20';
    ends[0].dispatchEvent(new Event('input'));
    await update();
    expect(presetService.getCapabilityFan(step, FixtureCapabilityType.Intensity)[0].valuePercentage).toBe(0.2);

    // from the middle out to both ends
    (element.querySelector('button[name="fan-shape-center"]') as HTMLButtonElement).click();
    await update();
    expect(presetService.getCapabilityFan(step, FixtureCapabilityType.Intensity).map((stop) => stop.valuePercentage)).toEqual([
      0.8, 0.2, 0.8,
    ]);
    expect(element.querySelectorAll('.fan-bar').length).toBeGreaterThan(1);

    // not fanned anymore: all the fixtures at the one in the middle
    (element.querySelector('button[name="fan"]') as HTMLButtonElement).click();
    await update();
    expect(component.isFanned()).toBe(false);
    expect(intensity()).toBe(0.2);
  });
});
