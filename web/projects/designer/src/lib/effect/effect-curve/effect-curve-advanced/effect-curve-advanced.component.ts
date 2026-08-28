import { Component } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { EffectCurve } from '../../../models/effect-curve';
import { LivePreviewService } from '../../../services/live-preview.service';

// The settings of a curve that do not fit next to its grid anymore. They are applied
// right away, like the ones on the effect itself, so the grid behind the dialog and the
// fixtures show what they do while they are being set.
@Component({
  selector: 'lib-app-effect-curve-advanced',
  templateUrl: './effect-curve-advanced.component.html',
  styleUrls: ['./effect-curve-advanced.component.css'],
  standalone: false,
})
export class EffectCurveAdvancedComponent {
  curve: EffectCurve;

  public runCyclesMin = 1;
  public runCyclesMax = 999;
  public runDurationMillisMin = 1;
  public runDurationMillisMax = 3600000;
  public dutyCyclePercentMin = 0;
  public dutyCyclePercentMax = 100;

  constructor(public bsModalRef: BsModalRef, public livePreviewService: LivePreviewService) {}

  // the duty cycle is stored as a part of the period and set as a percentage of it
  get dutyCyclePercent(): number {
    return Math.round(this.curve.dutyCycle * 100);
  }

  setDutyCyclePercent(value: any) {
    if (isNaN(value) || value < this.dutyCyclePercentMin || value > this.dutyCyclePercentMax) {
      return;
    }

    this.curve.dutyCycle = +value / 100;
    this.livePreviewService.previewLive();
  }

  setRunMode(runMode: string) {
    this.curve.runMode = runMode;
    this.livePreviewService.previewLive();
  }

  setRunCycles(value: any) {
    if (isNaN(value) || value < this.runCyclesMin || value > this.runCyclesMax) {
      return;
    }

    this.curve.runCycles = Math.round(+value);
    this.livePreviewService.previewLive();
  }

  setRunDurationMillis(value: any) {
    if (isNaN(value) || value < this.runDurationMillisMin || value > this.runDurationMillisMax) {
      return;
    }

    this.curve.runDurationMillis = Math.round(+value);
    this.livePreviewService.previewLive();
  }

  setEndMode(endMode: string) {
    this.curve.endMode = endMode;
    this.livePreviewService.previewLive();
  }

  close() {
    this.bsModalRef.hide();
  }
}
