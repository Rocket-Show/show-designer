import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Preset } from '../../../models/preset';
import { PresetStep } from '../../../models/preset-step';
import { PresetStepEffectAmount } from '../../../models/preset-step-effect-amount';
import { TransitionCurveType, transitionCurveTypes } from '../../../models/transition-curve';
import { PresetService } from '../../../services/preset.service';

@Component({
  selector: 'lib-preset-step-settings',
  templateUrl: './preset-step-settings.component.html',
  styleUrls: ['./preset-step-settings.component.css'],
  standalone: false,
})
export class PresetStepSettingsComponent implements OnInit {
  preset: Preset;
  step: PresetStep;

  name: string;
  startMillis: number;
  transitionMillis: number;
  transitionCurve: TransitionCurveType;

  // how much of each effect of the preset this step lets through, in percent and in the
  // order the preset holds its effects in
  effectAmounts: number[] = [];

  transitionCurveTypes = transitionCurveTypes;

  constructor(public bsModalRef: BsModalRef, private presetService: PresetService) {}

  ngOnInit() {
    this.name = this.step.name;
    this.startMillis = this.step.startMillis;
    this.transitionMillis = this.step.transitionMillis;
    this.transitionCurve = this.step.transitionCurve;

    for (const effect of this.preset.effects) {
      this.effectAmounts.push(Math.round(this.step.getEffectAmount(effect.uuid) * 100));
    }
  }

  ok() {
    this.step.name = this.name;

    if (!isNaN(this.startMillis) && this.startMillis >= 0) {
      this.step.startMillis = +this.startMillis;
    }
    if (!isNaN(this.transitionMillis) && this.transitionMillis >= 0) {
      this.step.transitionMillis = +this.transitionMillis;
    }

    this.step.transitionCurve = this.transitionCurve;

    // only the effects this step does not let through fully need to be written down
    this.step.effectAmounts = [];

    this.preset.effects.forEach((effect, index) => {
      const percentage = this.effectAmounts[index];

      if (isNaN(percentage) || percentage < 0 || percentage >= 100) {
        return;
      }

      const effectAmount = new PresetStepEffectAmount();
      effectAmount.effectUuid = effect.uuid;
      effectAmount.amount = +percentage / 100;
      this.step.effectAmounts.push(effectAmount);
    });

    // a step which was moved takes its new place in the sequence right away
    this.presetService.stepChanged();

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
