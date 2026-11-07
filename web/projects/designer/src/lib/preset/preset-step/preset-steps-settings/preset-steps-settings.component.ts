import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Preset } from '../../../models/preset';
import { getStepsLoopMillis, layoutSteps, PresetStep } from '../../../models/preset-step';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetStepService } from '../../../services/preset-step.service';
import { PresetService } from '../../../services/preset.service';

@Component({
  selector: 'lib-preset-steps-settings',
  templateUrl: './preset-steps-settings.component.html',
  styleUrls: ['./preset-steps-settings.component.css'],
  standalone: false,
})
export class PresetStepsSettingsComponent implements OnInit {
  preset: Preset;

  // how long each step lasts, which is the speed of the whole sequence
  stepsLengthMillis: number;

  stepsLoop: boolean;
  stepsLoopMillis: number;
  stepsPhasingMode: string;
  stepsPhasingMillis: number;
  stepsPhasingCycles: number;
  stepsPhasingGroupSize: number;

  constructor(
    public bsModalRef: BsModalRef,
    private presetService: PresetService,
    private presetStepService: PresetStepService,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.stepsLengthMillis = this.preset.stepsLengthMillis;
    this.stepsLoop = this.preset.stepsLoop;
    this.stepsLoopMillis = this.preset.stepsLoopMillis;
    this.stepsPhasingMode = this.preset.stepsPhasingMode;
    this.stepsPhasingMillis = this.preset.stepsPhasingMillis;
    this.stepsPhasingCycles = this.preset.stepsPhasingCycles;
    this.stepsPhasingGroupSize = this.preset.stepsPhasingGroupSize;
  }

  // the step length entered, or the one the sequence has for anything which is no length
  private enteredStepsLengthMillis(): number {
    const lengthMillis = +this.stepsLengthMillis;

    return !isNaN(lengthMillis) && lengthMillis > 0 ? lengthMillis : this.preset.stepsLengthMillis;
  }

  // what the sequence loops at while no length of its own is set, at the step length
  // entered so far: the steps are laid out on copies, the preset changes only once the
  // dialog is confirmed
  get automaticLoopMillis(): number {
    const steps = this.preset.steps.map((step) => new PresetStep({ startMillis: step.startMillis, ownStart: step.ownStart }));
    layoutSteps(steps, this.enteredStepsLengthMillis());

    return getStepsLoopMillis(steps);
  }

  // the chase is either a fixed time or a number of passes spread over the fixtures
  setPhasingAmount(amount: number) {
    if (this.stepsPhasingMode === 'spread') {
      this.stepsPhasingCycles = amount;
    } else {
      this.stepsPhasingMillis = amount;
    }
  }

  ok() {
    // the steps which do not start at a time of their own move to the new speed
    this.preset.stepsLengthMillis = this.enteredStepsLengthMillis();
    this.presetStepService.layoutSteps(this.preset);

    this.preset.stepsLoop = this.stepsLoop;

    // an empty length lets the last step hold as long as the one before it lasted
    if (this.stepsLoopMillis === undefined || this.stepsLoopMillis === null || (this.stepsLoopMillis as any) === '') {
      this.preset.stepsLoopMillis = undefined;
    } else if (!isNaN(this.stepsLoopMillis) && this.stepsLoopMillis > 0) {
      this.preset.stepsLoopMillis = +this.stepsLoopMillis;
    }

    this.preset.stepsPhasingMode = this.stepsPhasingMode;

    if (!isNaN(this.stepsPhasingMillis)) {
      this.preset.stepsPhasingMillis = +this.stepsPhasingMillis;
    }
    if (!isNaN(this.stepsPhasingCycles)) {
      this.preset.stepsPhasingCycles = +this.stepsPhasingCycles;
    }
    if (!isNaN(this.stepsPhasingGroupSize) && this.stepsPhasingGroupSize >= 1) {
      this.preset.stepsPhasingGroupSize = +this.stepsPhasingGroupSize;
    }

    this.presetService.stepsChanged.next();
    this.livePreviewService.previewLive();
    this.bsModalRef.hide();
  }

  cancel() {
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }
}
