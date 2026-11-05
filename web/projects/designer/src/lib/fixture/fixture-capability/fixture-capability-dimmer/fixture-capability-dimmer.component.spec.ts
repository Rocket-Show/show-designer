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
      declarations: [FixtureCapabilityDimmerComponent],
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

    expect(intensity()).toBeUndefined();
    expect(step.fixtureCapabilityValues).toEqual([]);
    expect(previewLive).toHaveBeenCalled();
  });

  it('shows nothing while no step is being edited', () => {
    presetService.selectedStep = undefined;

    expect(component.getValue()).toBeUndefined();
    expect(component.getValueText()).toBeUndefined();
  });
});
