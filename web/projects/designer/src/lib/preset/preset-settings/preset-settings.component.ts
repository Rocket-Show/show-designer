import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { TransitionCurveType, transitionCurveTypes } from '../../models/transition-curve';
import { PresetStepService } from '../../services/preset-step.service';
import { Preset } from '../../models/preset';

@Component({
  selector: 'lib-preset-settings',
  templateUrl: './preset-settings.component.html',
  styleUrls: ['./preset-settings.component.css'],
  standalone: false,
})
export class PresetSettingsComponent implements OnInit {
  preset: Preset;

  name: string;
  startMillis: number;
  endMillis: number;
  fadeInMillis: number;
  fadeOutMillis: number;
  fadeInPre: boolean;
  fadeOutPost: boolean;
  fadeInCurve: TransitionCurveType;
  fadeOutCurve: TransitionCurveType;

  stepsLoop: boolean;
  stepsLoopMillis: number;
  stepsPhasingMode: string;
  stepsPhasingMillis: number;
  stepsPhasingCycles: number;
  stepsPhasingGroupSize: number;

  // what the sequence loops at while no length of its own is set
  automaticLoopMillis: number;

  transitionCurveTypes = transitionCurveTypes;

  constructor(public bsModalRef: BsModalRef, private presetStepService: PresetStepService) {}

  ngOnInit() {
    this.name = this.preset.name;
    this.startMillis = this.preset.startMillis;
    this.endMillis = this.preset.endMillis;
    this.fadeInMillis = this.preset.fadeInMillis;
    this.fadeOutMillis = this.preset.fadeOutMillis;
    this.fadeInPre = this.preset.fadeInPre;
    this.fadeOutPost = this.preset.fadeOutPost;
    this.fadeInCurve = this.preset.fadeInCurve;
    this.fadeOutCurve = this.preset.fadeOutCurve;

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
    this.preset.name = this.name;

    if (this.startMillis === undefined || this.startMillis === null || (this.startMillis as any) === '') {
      this.preset.startMillis = undefined;
    } else if (!isNaN(this.startMillis) && this.startMillis >= 0) {
      this.preset.startMillis = +this.startMillis;
    }
    if (this.endMillis === undefined || this.endMillis === null || (this.endMillis as any) === '') {
      this.preset.endMillis = undefined;
    } else if (!isNaN(this.endMillis) && this.endMillis >= 0) {
      this.preset.endMillis = +this.endMillis;
    }
    if (!isNaN(this.fadeInMillis) && this.fadeInMillis >= 0) {
      this.preset.fadeInMillis = +this.fadeInMillis;
    }
    if (!isNaN(this.fadeOutMillis) && this.fadeOutMillis >= 0) {
      this.preset.fadeOutMillis = +this.fadeOutMillis;
    }

    this.preset.fadeInPre = this.fadeInPre;
    this.preset.fadeOutPost = this.fadeOutPost;
    this.preset.fadeInCurve = this.fadeInCurve;
    this.preset.fadeOutCurve = this.fadeOutCurve;

    this.preset.stepsLoop = this.stepsLoop;

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
