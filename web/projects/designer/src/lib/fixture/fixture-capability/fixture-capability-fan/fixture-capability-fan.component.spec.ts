import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { getFanStops } from '../../../models/fan';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { Preset } from '../../../models/preset';
import { PresetStep } from '../../../models/preset-step';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { FixtureCapabilityFanComponent } from './fixture-capability-fan.component';

// A value of the step fanned out over the fixtures of the preset: each end of the fan on a slider of its own, the shape
// of the fan, and a strip showing what each fixture gets
describe('FixtureCapabilityFanComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityFanComponent>;
  let component: FixtureCapabilityFanComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let step: PresetStep;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityFanComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    step = new PresetStep({ uuid: 'step' });
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = new Preset({ uuid: 'preset', fixtures: [] });
    presetService.selectedStep = step;
    spyOn(presetService, 'getPresetFixtureCount').and.returnValue(5);

    // the white emitter, fanned from 20 % to 100 %
    presetService.setCapabilityFan(step, FixtureCapabilityType.ColorIntensity, getFanStops('linear', 0.2, 1), FixtureCapabilityColor.White);

    fixture = TestBed.createComponent(FixtureCapabilityFanComponent);
    component = fixture.componentInstance;
    component.types = [FixtureCapabilityType.ColorIntensity];
    component.color = FixtureCapabilityColor.White;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function stops(): number[][] {
    return presetService
      .getCapabilityFan(step, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.White)
      .map((stop) => [stop.position, stop.valuePercentage]);
  }

  it('shows both ends of the fan and what each fixture gets', () => {
    expect(component.fan).toEqual({ shape: 'linear', from: 0.2, to: 1 });
    expect(Array.from(element.querySelectorAll('input.fan-value')).map((input: HTMLInputElement) => input.value)).toEqual(['20', '100']);

    // a bar for each of the five fixtures
    expect(component.bars.map((bar) => Math.round(bar * 100))).toEqual([20, 40, 60, 80, 100]);
    expect(element.querySelectorAll('.fan-bar').length).toBe(5);
  });

  it('sets the ends and the shape of the fan, as far as they reach', () => {
    component.setEnd('to', 0.5);
    expect(stops()).toEqual([
      [0, 0.2],
      [1, 0.5],
    ]);

    // beyond what a value reaches, or no number: nothing changes
    component.setEnd('from', 1.5);
    component.setEnd('from', 'much');
    expect(stops()[0]).toEqual([0, 0.2]);

    component.setShape('center');
    expect(stops()).toEqual([
      [0, 0.5],
      [0.5, 0.2],
      [1, 0.5],
    ]);
    expect(component.shape).toBe('center');
  });
});
