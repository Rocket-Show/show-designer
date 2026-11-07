import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Preset } from '../../../models/preset';
import { getStepsLoopMillis, layoutSteps, PresetStep } from '../../../models/preset-step';
import { stepsOrders } from '../../../models/preset-steps-order';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetStepService } from '../../../services/preset-step.service';
import { PresetService } from '../../../services/preset.service';
import { TimelineService } from '../../../services/timeline.service';
import { EffectCurve } from '../../../models/effect-curve';

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

  // the step length as entered: in milliseconds, or in beats while the steps follow the beat. Their times are written
  // down at the tempo stepsBeatsPerMinute then (see Preset.stepsLengthMode).
  stepsLength: number;
  stepsLengthMode: string;
  stepsBeatsPerMinute: number;

  stepsLoop: boolean;
  stepsLoopMillis: number;
  stepsOrder: string;
  stepsSeed: number;
  stepsOrders = stepsOrders;
  stepsPhasingMode: string;
  stepsPhasingMillis: number;
  stepsPhasingCycles: number;
  stepsPhasingGroupSize: number;

  constructor(
    public bsModalRef: BsModalRef,
    private presetService: PresetService,
    private presetStepService: PresetStepService,
    private timelineService: TimelineService,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.stepsLengthMillis = this.preset.stepsLengthMillis;
    this.stepsLengthMode = this.preset.stepsLengthMode;
    // steps which start to follow the beat are written down at the tempo of the composition open
    this.stepsBeatsPerMinute = this.stepsLengthMode === 'beats' ? this.preset.stepsBeatsPerMinute : this.getTempo();
    this.stepsLength = this.toEntered(this.stepsLengthMillis);
    this.stepsLoop = this.preset.stepsLoop;
    this.stepsLoopMillis = this.preset.stepsLoopMillis;
    this.stepsOrder = this.preset.stepsOrder;
    this.stepsSeed = this.preset.stepsSeed;
    this.stepsPhasingMode = this.preset.stepsPhasingMode;
    this.stepsPhasingMillis = this.preset.stepsPhasingMillis;
    this.stepsPhasingCycles = this.preset.stepsPhasingCycles;
    this.stepsPhasingGroupSize = this.preset.stepsPhasingGroupSize;
  }

  // the step length entered, or the one the sequence has for anything which is no length
  // the tempo of the composition open, which steps starting to follow the beat are written down at
  private getTempo(): number {
    const beatsPerMinute = this.timelineService?.selectedComposition?.beatsPerMinute;

    return beatsPerMinute > 0 ? beatsPerMinute : EffectCurve.defaultBeatsPerMinute;
  }

  // a length in milliseconds as it is entered: in beats while the steps follow the beat
  private toEntered(lengthMillis: number): number {
    return this.stepsLengthMode === 'beats' ? Math.round(((lengthMillis * this.stepsBeatsPerMinute) / 60000) * 1000) / 1000 : lengthMillis;
  }

  // the length entered in the unit picked so far stays the same length when another one is picked
  setStepsLengthMode(mode: string) {
    const lengthMillis = this.enteredStepsLengthMillis();
    this.stepsLengthMode = mode;
    this.stepsLength = this.toEntered(lengthMillis);
  }

  private enteredStepsLengthMillis(): number {
    const entered = +this.stepsLength;
    const lengthMillis = this.stepsLengthMode === 'beats' ? (entered * 60000) / this.stepsBeatsPerMinute : entered;

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
    this.preset.stepsLengthMode = this.stepsLengthMode;
    this.preset.stepsBeatsPerMinute = this.stepsBeatsPerMinute;
    this.presetStepService.layoutSteps(this.preset);

    this.preset.stepsLoop = this.stepsLoop;

    // an empty length lets the last step hold as long as the one before it lasted
    if (this.stepsLoopMillis === undefined || this.stepsLoopMillis === null || (this.stepsLoopMillis as any) === '') {
      this.preset.stepsLoopMillis = undefined;
    } else if (!isNaN(this.stepsLoopMillis) && this.stepsLoopMillis > 0) {
      this.preset.stepsLoopMillis = +this.stepsLoopMillis;
    }

    this.preset.stepsOrder = this.stepsOrder;

    // a seed is a whole number, like the one of a pixel effect
    if (!isNaN(this.stepsSeed) && (this.stepsSeed as any) !== '' && this.stepsSeed !== null) {
      this.preset.stepsSeed = Math.round(+this.stepsSeed);
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
