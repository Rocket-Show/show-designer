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
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { PresetStepsSettingsComponent } from './preset-steps-settings.component';

// How the steps of a preset run as a whole: how long each of them lasts, whether they start
// over, how long a pass lasts and how they chase over the fixtures. Nothing is changed until
// the dialog is confirmed.
describe('PresetStepsSettingsComponent', () => {
  let fixture: ComponentFixture<PresetStepsSettingsComponent>;
  let element: HTMLElement;
  let preset: Preset;
  let modalRef: jasmine.SpyObj<BsModalRef>;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    modalRef = jasmine.createSpyObj('BsModalRef', ['hide']);

    await TestBed.configureTestingModule({
      declarations: [PresetStepsSettingsComponent],
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

    preset = new Preset({
      uuid: 'chase',
      steps: [{ uuid: 'first' }, { uuid: 'second', startMillis: 1000 }],
      stepsPhasingMillis: 100,
      stepsPhasingCycles: 2,
    });

    fixture = TestBed.createComponent(PresetStepsSettingsComponent);
    fixture.componentInstance.preset = preset;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // the dialog listens to the enter key on the whole document
  afterEach(() => fixture.destroy());

  function inputs(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input[type="text"]'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function selectMode(mode: string) {
    const select: HTMLSelectElement = element.querySelector('#stepsPhasingMode');
    select.value = mode;
    select.dispatchEvent(new Event('change'));
  }

  function ok() {
    (element.querySelector('button.btn-primary') as HTMLButtonElement).click();
  }

  it('shows the step length of the sequence', () => {
    expect(inputs()[0].value).toBe('1000');
  });

  it('moves the steps to the step length typed in, apart from the ones starting at a time of their own', () => {
    const stepsChanged = spyOn(TestBed.inject(PresetService).stepsChanged, 'next');
    preset.steps.push(new PresetStep({ uuid: 'third', startMillis: 3000, ownStart: true }));

    type(inputs()[0], '500');
    ok();

    expect(preset.stepsLengthMillis).toBe(500);
    expect(preset.steps.map((step) => step.startMillis)).toEqual([0, 500, 3000]);
    expect(stepsChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();
  });

  it('keeps the step length for anything which is no length', () => {
    for (const typed of ['abc', '0', '-5', '']) {
      type(inputs()[0], typed);
      ok();

      expect(preset.stepsLengthMillis).toBe(1000);
      expect(preset.steps[1].startMillis).toBe(1000);
    }
  });

  it('shows the length a pass would take at the step length typed in', async () => {
    type(inputs()[0], '250');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(inputs()[1].placeholder).toBe('500');
    // the steps themselves only move once the dialog is confirmed
    expect(preset.steps[1].startMillis).toBe(1000);
  });

  it('shows the length a pass takes on its own, while none is set', () => {
    // the last step holds as long as the one before it lasted
    expect(inputs()[1].placeholder).toBe('2000');
    expect(inputs()[1].value).toBe('');
  });

  it('loops the steps over a length of their own', () => {
    (element.querySelector('#stepsLoop') as HTMLInputElement).click();
    type(inputs()[1], '3000');

    ok();

    expect(preset.stepsLoop).toBe(true);
    expect(preset.stepsLoopMillis).toBe(3000);
    expect(previewLive).toHaveBeenCalled();
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('goes back to the length of the steps, once the length is emptied', () => {
    preset.stepsLoopMillis = 3000;
    fixture.componentInstance.ngOnInit();

    type(inputs()[1], '');
    ok();

    expect(preset.stepsLoopMillis).toBeUndefined();
  });

  it('keeps the length for anything which is no length', () => {
    preset.stepsLoopMillis = 3000;

    for (const typed of ['abc', '0', '-5']) {
      type(inputs()[1], typed);
      ok();

      expect(preset.stepsLoopMillis).toBe(3000);
    }
  });

  it('chases by a time or by passes spread over the fixtures', async () => {
    expect(inputs()[2].value).toBe('100');

    type(inputs()[2], '250');
    selectMode('spread');
    fixture.detectChanges();
    await fixture.whenStable();

    // the same field now holds the passes
    expect(inputs()[2].value).toBe('2');

    type(inputs()[2], '-1');
    ok();

    expect(preset.stepsPhasingMode).toBe('spread');
    expect(preset.stepsPhasingMillis).toBe(250);
    expect(preset.stepsPhasingCycles).toBe(-1);
  });

  it('plays the steps in the order picked, a random one from a whole seed', async () => {
    const order: HTMLSelectElement = element.querySelector('#stepsOrder');
    expect(order.value).toBe('forward');

    order.value = 'random';
    order.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    const seed: HTMLInputElement = element.querySelector('input[aria-label="designer.preset.steps-seed"]');
    type(seed, '7.4');
    ok();

    expect(preset.stepsOrder).toBe('random');
    expect(preset.stepsSeed).toBe(7);
  });

  it('times the steps in beats, written down at the tempo of the composition open, which they follow', async () => {
    const mode: HTMLSelectElement = element.querySelector('#stepsLengthMode');
    mode.value = 'beats';
    mode.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    // a second at 120 BPM (no composition open) is two beats
    expect(inputs()[0].value).toBe('2');

    type(inputs()[0], '1');
    ok();

    expect(preset.stepsLengthMode).toBe('beats');
    expect(preset.stepsBeatsPerMinute).toBe(120);
    expect(preset.stepsLengthMillis).toBe(500);
  });

  it('keeps the chase for anything which is no number', () => {
    type(inputs()[2], 'abc');
    ok();

    expect(preset.stepsPhasingMillis).toBe(100);
  });

  it('groups the fixtures of the chase, a group holding one fixture at least', () => {
    type(inputs()[3], '0');
    ok();
    expect(preset.stepsPhasingGroupSize).toBe(1);

    type(inputs()[3], '4');
    ok();
    expect(preset.stepsPhasingGroupSize).toBe(4);
  });

  it('confirms with the enter key', () => {
    type(inputs()[1], '1500');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(preset.stepsLoopMillis).toBe(1500);
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('changes nothing when it is cancelled', () => {
    (element.querySelector('#stepsLoop') as HTMLInputElement).click();
    type(inputs()[0], '250');
    type(inputs()[1], '3000');

    (element.querySelector('.modal-footer a') as HTMLElement).click();

    expect(preset.stepsLoop).toBe(false);
    expect(preset.stepsLoopMillis).toBeUndefined();
    expect(preset.stepsLengthMillis).toBe(1000);
    expect(modalRef.hide).toHaveBeenCalled();
    expect(previewLive).not.toHaveBeenCalled();
  });
});
