import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Preset } from '../../../models/preset';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetStepService } from '../../../services/preset-step.service';

@Component({
  selector: 'lib-preset-steps-settings',
  templateUrl: './preset-steps-settings.component.html',
  styleUrls: ['./preset-steps-settings.component.css'],
  standalone: false,
})
export class PresetStepsSettingsComponent implements OnInit {
  preset: Preset;

  stepsLoop: boolean;
  stepsLoopMillis: number;
  stepsPhasingMode: string;
  stepsPhasingMillis: number;
  stepsPhasingCycles: number;
  stepsPhasingGroupSize: number;

  // what the sequence loops at while no length of its own is set
  automaticLoopMillis: number;

  constructor(
    public bsModalRef: BsModalRef,
    private presetStepService: PresetStepService,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.stepsLoop = this.preset.stepsLoop;
    this.stepsLoopMillis = this.preset.stepsLoopMillis;
    this.stepsPhasingMode = this.preset.stepsPhasingMode;
    this.stepsPhasingMillis = this.preset.stepsPhasingMillis;
    this.stepsPhasingCycles = this.preset.stepsPhasingCycles;
    this.stepsPhasingGroupSize = this.preset.stepsPhasingGroupSize;
    this.automaticLoopMillis = this.presetStepService.getStepsLoopMillis(this.preset);
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
