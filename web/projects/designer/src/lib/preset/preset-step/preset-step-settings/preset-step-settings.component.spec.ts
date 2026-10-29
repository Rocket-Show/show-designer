import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { Preset } from '../../../models/preset';
import { PresetStep } from '../../../models/preset-step';
import { Project } from '../../../models/project';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';
import { PresetStepSettingsComponent } from './preset-step-settings.component';

// The settings of one step of a preset: when it starts, how it travels into its values and
// how much of each effect of the preset it lets through. Nothing is changed until the dialog
// is confirmed.
describe('PresetStepSettingsComponent', () => {
  let fixture: ComponentFixture<PresetStepSettingsComponent>;
  let element: HTMLElement;
  let preset: Preset;
  let step: PresetStep;
  let modalRef: jasmine.SpyObj<BsModalRef>;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    modalRef = jasmine.createSpyObj('BsModalRef', ['hide']);

    await TestBed.configureTestingModule({
      declarations: [PresetStepSettingsComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalRef, useValue: modalRef },
      ],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const project = new Project({
      presets: [
        {
          uuid: 'chase',
          steps: [
            { uuid: 'first' },
            { uuid: 'second', startMillis: 1000, effectAmounts: [{ effectUuid: 'wave', amount: 0.25 }] },
            { uuid: 'third', startMillis: 3000 },
          ],
          effects: [
            { type: 'curve', uuid: 'wave' },
            { type: 'curve', uuid: 'pulse' },
          ],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    preset = project.presets[0];
    step = preset.steps[1];
    TestBed.inject(PresetService).selectedPreset = preset;

    fixture = TestBed.createComponent(PresetStepSettingsComponent);
    fixture.componentInstance.preset = preset;
    fixture.componentInstance.step = step;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // the dialog listens to the enter key on the whole document
  afterEach(() => fixture.destroy());

  // the start, the transition and the amounts of the effects
  function inputs(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input[type="text"]'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function ok() {
    (element.querySelector('button.btn-primary') as HTMLButtonElement).click();
  }

  it('shows which step it is and the time it travels over, while it has none of its own', () => {
    expect(element.querySelector('.modal-title').textContent.trim()).toBe('designer.preset.step 2');
    expect(inputs()[0].value).toBe('1000');
    expect(inputs()[1].placeholder).toBe('2000');
    expect(inputs()[1].value).toBe('');
  });

  it('shows how much of each effect the step lets through', () => {
    expect(inputs().length).toBe(4);
    expect(inputs()[2].value).toBe('25');
    expect(inputs()[3].value).toBe('100');
  });

  it('moves the step to the time typed in, which puts it in its new place', () => {
    type(inputs()[0], '5000');
    ok();

    expect(step.startMillis).toBe(5000);
    expect(preset.steps.map((presetStep) => presetStep.uuid)).toEqual(['first', 'third', 'second']);
    expect(previewLive).toHaveBeenCalled();
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('keeps the start for anything which is no time', () => {
    for (const typed of ['abc', '-1']) {
      type(inputs()[0], typed);
      ok();

      expect(step.startMillis).toBe(1000);
    }
  });

  it('travels into the step over the time typed in, or over the whole step while it is empty', () => {
    type(inputs()[1], '500');
    ok();
    expect(step.transitionMillis).toBe(500);

    type(inputs()[1], 'abc');
    ok();
    expect(step.transitionMillis).toBe(500);

    type(inputs()[1], '');
    ok();
    expect(step.transitionMillis).toBeUndefined();
  });

  it('shapes the transition with the curve picked', () => {
    const select: HTMLSelectElement = element.querySelector('select');
    select.value = 'ease-in-out';
    select.dispatchEvent(new Event('change'));

    ok();

    expect(step.transitionCurve).toBe('ease-in-out');
  });

  it('only writes down the effects the step does not let through fully', () => {
    type(inputs()[2], '100');
    type(inputs()[3], '40');
    ok();

    expect(step.effectAmounts.length).toBe(1);
    expect(step.effectAmounts[0].effectUuid).toBe('pulse');
    expect(step.effectAmounts[0].amount).toBe(0.4);
    expect(step.getEffectAmount('wave')).toBe(1);
  });

  it('keeps the amount of an effect for anything which is no percentage', () => {
    for (const typed of ['abc', '-10']) {
      type(inputs()[2], typed);
      ok();

      expect(step.getEffectAmount('wave')).toBe(0.25);
    }
  });

  it('confirms with the enter key', () => {
    type(inputs()[0], '2000');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(step.startMillis).toBe(2000);
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('changes nothing when it is cancelled', () => {
    type(inputs()[0], '5000');
    type(inputs()[2], '0');

    (element.querySelector('.modal-footer a') as HTMLElement).click();

    expect(step.startMillis).toBe(1000);
    expect(step.getEffectAmount('wave')).toBe(0.25);
    expect(modalRef.hide).toHaveBeenCalled();
    expect(previewLive).not.toHaveBeenCalled();
  });
});
