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
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetStepsSettingsComponent } from './preset-steps-settings.component';

// How the steps of a preset run as a whole: whether they start over, how long a pass lasts
// and how they chase over the fixtures. Nothing is changed until the dialog is confirmed.
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
    const select: HTMLSelectElement = element.querySelector('select');
    select.value = mode;
    select.dispatchEvent(new Event('change'));
  }

  function ok() {
    (element.querySelector('button.btn-primary') as HTMLButtonElement).click();
  }

  it('shows the length a pass takes on its own, while none is set', () => {
    // the last step holds as long as the one before it lasted
    expect(inputs()[0].placeholder).toBe('2000');
    expect(inputs()[0].value).toBe('');
  });

  it('loops the steps over a length of their own', () => {
    (element.querySelector('#stepsLoop') as HTMLInputElement).click();
    type(inputs()[0], '3000');

    ok();

    expect(preset.stepsLoop).toBe(true);
    expect(preset.stepsLoopMillis).toBe(3000);
    expect(previewLive).toHaveBeenCalled();
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('goes back to the length of the steps, once the length is emptied', () => {
    preset.stepsLoopMillis = 3000;
    fixture.componentInstance.ngOnInit();

    type(inputs()[0], '');
    ok();

    expect(preset.stepsLoopMillis).toBeUndefined();
  });

  it('keeps the length for anything which is no length', () => {
    preset.stepsLoopMillis = 3000;

    for (const typed of ['abc', '0', '-5']) {
      type(inputs()[0], typed);
      ok();

      expect(preset.stepsLoopMillis).toBe(3000);
    }
  });

  it('chases by a time or by passes spread over the fixtures', async () => {
    expect(inputs()[1].value).toBe('100');

    type(inputs()[1], '250');
    selectMode('spread');
    fixture.detectChanges();
    await fixture.whenStable();

    // the same field now holds the passes
    expect(inputs()[1].value).toBe('2');

    type(inputs()[1], '-1');
    ok();

    expect(preset.stepsPhasingMode).toBe('spread');
    expect(preset.stepsPhasingMillis).toBe(250);
    expect(preset.stepsPhasingCycles).toBe(-1);
  });

  it('keeps the chase for anything which is no number', () => {
    type(inputs()[1], 'abc');
    ok();

    expect(preset.stepsPhasingMillis).toBe(100);
  });

  it('groups the fixtures of the chase, a group holding one fixture at least', () => {
    type(inputs()[2], '0');
    ok();
    expect(preset.stepsPhasingGroupSize).toBe(1);

    type(inputs()[2], '4');
    ok();
    expect(preset.stepsPhasingGroupSize).toBe(4);
  });

  it('confirms with the enter key', () => {
    type(inputs()[0], '1500');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(preset.stepsLoopMillis).toBe(1500);
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('changes nothing when it is cancelled', () => {
    (element.querySelector('#stepsLoop') as HTMLInputElement).click();
    type(inputs()[0], '3000');

    (element.querySelector('.modal-footer a') as HTMLElement).click();

    expect(preset.stepsLoop).toBe(false);
    expect(preset.stepsLoopMillis).toBeUndefined();
    expect(modalRef.hide).toHaveBeenCalled();
    expect(previewLive).not.toHaveBeenCalled();
  });
});
