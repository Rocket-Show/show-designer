import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { getTransitionStartMillis, PresetStep } from '../../models/preset-step';
import { PresetService } from '../../services/preset.service';
import { PresetStepSettingsComponent } from './preset-step-settings/preset-step-settings.component';
import { PresetStepsSettingsComponent } from './preset-steps-settings/preset-steps-settings.component';

@Component({
  selector: 'lib-app-preset-step',
  templateUrl: './preset-step.component.html',
  styleUrls: ['./preset-step.component.css'],
  standalone: false,
})
export class PresetStepComponent implements OnInit, OnDestroy {
  // the step the preset is on while it runs, which the preview works out on every
  // frame outside of Angular
  activeStep: PresetStep;

  private activeStepTimer: any;

  constructor(
    public presetService: PresetService,
    private modalService: BsModalService,
    private translateService: TranslateService,
    private changeDetectorRef: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    // reading the playing step on a clock of its own keeps the rail off the render
    // loop: it redraws when the step changes, not on every frame
    this.ngZone.runOutsideAngular(() => {
      this.activeStepTimer = setInterval(() => {
        if (this.presetService.stepPreviewRunning && this.presetService.stepPreviewFinished()) {
          this.ngZone.run(() => this.presetService.setStepPreviewRunning(false));
        }

        if (this.activeStep !== this.presetService.activeStep) {
          this.activeStep = this.presetService.activeStep;
          this.ngZone.run(() => this.changeDetectorRef.detectChanges());
        }
      }, 100);
    });
  }

  ngOnDestroy() {
    clearInterval(this.activeStepTimer);
  }

  // a step only shows its number, so its times are read on the way past it
  stepDescription(step: PresetStep, index: number): string {
    const millis = this.translateService.instant('designer.misc.ms');
    const reached = this.translateService.instant('designer.preset.step-start') + ': ' + step.startMillis + ' ' + millis;

    if (index === 0) {
      return reached;
    }

    const previous = this.presetService.selectedPreset.steps[index - 1];
    const transitionMillis = step.startMillis - getTransitionStartMillis(step, step.startMillis, previous.startMillis);

    return reached + ', ' + this.translateService.instant('designer.preset.step-transition') + ': ' + transitionMillis + ' ' + millis;
  }

  selectStep(step: PresetStep) {
    this.presetService.selectStep(step);
  }

  addStep() {
    this.presetService.addStep();
  }

  deleteStep() {
    if (this.presetService.selectedPreset.steps.length < 2) {
      // a preset always keeps a step: its values are the preset itself
      return;
    }

    this.presetService.deleteStep(this.presetService.selectedStep);
  }

  switchStepPreview() {
    this.presetService.setStepPreviewRunning(!this.presetService.stepPreviewRunning);
  }

  // how the sequence as a whole runs: looping, and chasing over the fixtures
  openStepsSettings() {
    this.modalService.show(PresetStepsSettingsComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { preset: this.presetService.selectedPreset },
    });
  }

  openSettings(step: PresetStep) {
    // the modal reads both of them in ngOnInit, which runs while it is created:
    // handing them over afterwards would be too late
    this.modalService.show(PresetStepSettingsComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { preset: this.presetService.selectedPreset, step },
    });
  }
}
