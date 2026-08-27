import { Component } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PresetStep } from '../../models/preset-step';
import { LivePreviewService } from '../../services/live-preview.service';
import { PresetService } from '../../services/preset.service';
import { PresetStepSettingsComponent } from './preset-step-settings/preset-step-settings.component';

@Component({
  selector: 'lib-app-preset-step',
  templateUrl: './preset-step.component.html',
  styleUrls: ['./preset-step.component.css'],
  standalone: false,
})
export class PresetStepComponent {
  constructor(public presetService: PresetService, private livePreviewService: LivePreviewService, private modalService: BsModalService) {}

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

  switchLoop() {
    this.presetService.selectedPreset.stepsLoop = !this.presetService.selectedPreset.stepsLoop;
    this.livePreviewService.previewLive();
  }

  switchStepPreview() {
    this.presetService.setStepPreviewRunning(!this.presetService.stepPreviewRunning);
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
