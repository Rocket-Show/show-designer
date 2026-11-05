import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { EffectCurve } from '../../../models/effect-curve';
import { LivePreviewService } from '../../../services/live-preview.service';
import { EffectPanTilt } from '../../../models/effect-pan-tilt';
import { EffectCurveAdvancedComponent } from './effect-curve-advanced.component';

// The settings of a curve which do not fit next to its grid: how long it runs, the part of
// the period it is on and how many fixtures its chase moves at a time. They apply right away.
describe('EffectCurveAdvancedComponent', () => {
  let fixture: ComponentFixture<EffectCurveAdvancedComponent>;
  let component: EffectCurveAdvancedComponent;
  let element: HTMLElement;
  let curve: EffectCurve;
  let modalRef: jasmine.SpyObj<BsModalRef>;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    modalRef = jasmine.createSpyObj('BsModalRef', ['hide']);

    await TestBed.configureTestingModule({
      declarations: [EffectCurveAdvancedComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalRef, useValue: modalRef },
      ],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    curve = new EffectCurve();

    fixture = TestBed.createComponent(EffectCurveAdvancedComponent);
    component = fixture.componentInstance;
    component.curve = curve;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function inputs(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input.slider-input'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function selectRunMode(runMode: string) {
    const select: HTMLSelectElement = element.querySelector('select');
    select.value = runMode;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('leaves out the part of the period for a movement of the moving heads, which has none', () => {
    expect(element.textContent).toContain('designer.effect.curve-duty');

    component.curve = new EffectPanTilt({ uuid: 'move' });
    fixture.detectChanges();

    expect(element.textContent).not.toContain('designer.effect.curve-duty');
    expect(element.textContent).toContain('designer.effect.curve-chase-group');
  });

  it('runs forever, without asking what is left behind', () => {
    // the duty cycle and the chase group
    expect(inputs().map((input) => input.value)).toEqual(['50', '1']);
    expect(element.querySelectorAll('select').length).toBe(1);
  });

  it('runs a number of cycles', async () => {
    await selectRunMode('cycles');

    expect(curve.runMode).toBe('cycles');
    expect(previewLive).toHaveBeenCalled();

    // the cycles come first now
    type(inputs()[0], '3.4');
    expect(curve.runCycles).toBe(3);

    for (const typed of ['abc', '0', '1000']) {
      type(inputs()[0], typed);
    }
    expect(curve.runCycles).toBe(3);
  });

  it('runs for a time', async () => {
    await selectRunMode('duration');

    type(inputs()[0], '1500.4');
    expect(curve.runDurationMillis).toBe(1500);

    for (const typed of ['abc', '0', '3600001']) {
      type(inputs()[0], typed);
    }
    expect(curve.runDurationMillis).toBe(1500);
  });

  it('leaves what the rest of the preset puts on the fixtures, once it has finished', async () => {
    await selectRunMode('cycles');

    const endSelect: HTMLSelectElement = element.querySelectorAll('select')[1];
    endSelect.value = 'base';
    endSelect.dispatchEvent(new Event('change'));

    expect(curve.endMode).toBe('base');
  });

  it('sets the part of the period the curve is on in percent', () => {
    type(inputs()[0], '25');

    expect(curve.dutyCycle).toBe(0.25);
    expect(component.dutyCyclePercent).toBe(25);
    expect(previewLive).toHaveBeenCalled();

    for (const typed of ['abc', '-1', '101']) {
      type(inputs()[0], typed);
    }
    expect(curve.dutyCycle).toBe(0.25);

    component.setDutyCyclePercent(100);
    expect(curve.dutyCycle).toBe(1);
  });

  it('moves the fixtures of the chase in groups, larger ones typed in than the slider offers', () => {
    type(inputs()[1], '64');
    expect(curve.phasingGroupSize).toBe(64);

    // the slider reports its value as a number
    component.setPhasingGroupSize(2.6);
    expect(curve.phasingGroupSize).toBe(3);

    for (const typed of ['abc', '0', '513']) {
      type(inputs()[1], typed);
    }
    expect(curve.phasingGroupSize).toBe(3);
  });

  it('closes with its button and its cross', () => {
    (element.querySelector('button.btn-primary') as HTMLButtonElement).click();
    (element.querySelector('button.close') as HTMLButtonElement).click();

    expect(modalRef.hide).toHaveBeenCalledTimes(2);
  });
});
