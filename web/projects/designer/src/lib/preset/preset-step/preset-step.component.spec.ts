import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';

import { Preset } from '../../models/preset';
import { Project } from '../../models/project';
import { AnimationService } from '../../services/animation.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { PresetService } from '../../services/preset.service';
import { ProjectService } from '../../services/project.service';
import { PresetStepComponent } from './preset-step.component';
import { PresetStepSettingsComponent } from './preset-step-settings/preset-step-settings.component';
import { PresetStepsSettingsComponent } from './preset-steps-settings/preset-steps-settings.component';

// The rail of the steps of the preset being edited: it picks the step the panels edit, adds
// and removes steps, runs them in the preview and marks the one the preset is on while it runs.
describe('PresetStepComponent', () => {
  let fixture: ComponentFixture<PresetStepComponent>;
  let element: HTMLElement;
  let presetService: PresetService;
  let preset: Preset;
  let modalService: { show: jasmine.Spy };

  beforeEach(async () => {
    modalService = { show: jasmine.createSpy('show') };

    await TestBed.configureTestingModule({
      declarations: [PresetStepComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalService, useValue: modalService },
      ],
    }).compileComponents();

    spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const project = new Project({
      presets: [
        {
          uuid: 'chase',
          steps: [{ uuid: 'first' }, { uuid: 'second', startMillis: 1000, transitionMillis: 200 }, { uuid: 'third', startMillis: 2000 }],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;
    preset = project.presets[0];

    presetService = TestBed.inject(PresetService);
    presetService.selectPreset(0);
  });

  // the rail reads the playing step on a clock of its own, which has to be stopped
  afterEach(() => fixture?.destroy());

  function render() {
    fixture = TestBed.createComponent(PresetStepComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  function steps(): HTMLElement[] {
    return Array.from(element.querySelectorAll('.step:not(.step-add)'));
  }

  function selectedStepNumbers(): string[] {
    return steps()
      .filter((step) => step.classList.contains('step-selected'))
      .map((step) => step.textContent.trim());
  }

  // the buttons above and below the steps: run, settings of all steps, settings of the
  // selected step, remove
  function actions(): HTMLElement[] {
    return Array.from(element.querySelectorAll('.step-list-actions a'));
  }

  it('shows the steps of the preset being edited, marking the selected one', () => {
    render();

    expect(steps().map((step) => step.textContent.trim())).toEqual(['1', '2', '3']);
    expect(selectedStepNumbers()).toEqual(['1']);
  });

  it('stays out of the way of a preset with a single step', () => {
    preset.steps.splice(1, 2);
    render();

    expect(element.querySelector('.step-list')).toBeNull();
  });

  it('edits the step clicked', () => {
    render();

    steps()[1].click();
    fixture.detectChanges();

    expect(presetService.selectedStep).toBe(preset.steps[1]);
    expect(selectedStepNumbers()).toEqual(['2']);
  });

  it('adds a step at the end, starting out from the selected one, and edits it', () => {
    render();

    (element.querySelector('.step-add') as HTMLElement).click();
    fixture.detectChanges();

    expect(preset.steps.length).toBe(4);
    expect(presetService.selectedStep).toBe(preset.steps[3]);
    expect(selectedStepNumbers()).toEqual(['4']);
  });

  it('removes the selected step, but always keeps one', () => {
    render();
    presetService.selectStep(preset.steps[1]);

    actions()[3].click();
    fixture.detectChanges();

    expect(preset.steps.map((step) => step.uuid)).toEqual(['first', 'third']);
    expect(presetService.selectedStep).toBe(preset.steps[0]);

    fixture.componentInstance.deleteStep();
    fixture.componentInstance.deleteStep();

    expect(preset.steps.map((step) => step.uuid)).toEqual(['third']);
  });

  it('runs the steps in the preview and stops them again', () => {
    render();
    const run = actions()[0];

    run.click();
    fixture.detectChanges();

    expect(presetService.stepPreviewRunning).toBe(true);
    expect(run.querySelector('i').classList).toContain('fa-pause');

    run.click();
    fixture.detectChanges();

    expect(presetService.stepPreviewRunning).toBe(false);
    expect(run.querySelector('i').classList).toContain('fa-play');
  });

  it('tells when a step starts and how long it travels into it', () => {
    render();
    const component = fixture.componentInstance;

    // the first step has nothing to travel from
    expect(component.stepDescription(preset.steps[0], 0)).toBe('designer.preset.step-start: 0 designer.misc.ms');
    expect(component.stepDescription(preset.steps[1], 1)).toBe(
      'designer.preset.step-start: 1000 designer.misc.ms, designer.preset.step-transition: 200 designer.misc.ms'
    );

    // unless the sequence starts over: it travels from the last step over its whole time
    preset.stepsLoop = true;
    expect(component.stepDescription(preset.steps[0], 0)).toBe(
      'designer.preset.step-start: 0 designer.misc.ms, designer.preset.step-transition: 1000 designer.misc.ms'
    );
  });

  it('opens the settings of a step double clicked, of the selected one or of all of them', () => {
    render();

    steps()[2].dispatchEvent(new MouseEvent('dblclick'));

    expect(modalService.show).toHaveBeenCalledWith(
      PresetStepSettingsComponent,
      jasmine.objectContaining({ initialState: { preset, step: preset.steps[2] } })
    );

    actions()[2].click();

    expect(modalService.show).toHaveBeenCalledWith(
      PresetStepSettingsComponent,
      jasmine.objectContaining({ initialState: { preset, step: preset.steps[0] } })
    );

    actions()[1].click();

    expect(modalService.show).toHaveBeenCalledWith(PresetStepsSettingsComponent, jasmine.objectContaining({ initialState: { preset } }));
  });

  it('marks the step the preset is on while it runs, and how far it has come', fakeAsync(() => {
    render();

    presetService.activeStep = preset.steps[1];
    presetService.activeStepProgress = 0.456;
    tick(100);

    expect(steps()[0].querySelector('.step-progress')).toBeNull();
    expect((steps()[1].querySelector('.step-progress') as HTMLElement).style.width).toBe('46%');

    presetService.activeStep = undefined;
    tick(100);

    expect(element.querySelector('.step-progress')).toBeNull();

    fixture.destroy();
  }));

  it('stops a run which does not loop, once it has gone through all its steps', fakeAsync(() => {
    render();
    const animationService = TestBed.inject(AnimationService);

    presetService.setStepPreviewRunning(true);

    // a pass lasts until the last step has held as long as the one before it
    animationService.timeMillis = 2999;
    tick(100);
    expect(presetService.stepPreviewRunning).toBe(true);

    animationService.timeMillis = 3000;
    tick(100);
    expect(presetService.stepPreviewRunning).toBe(false);

    fixture.destroy();
  }));
});
