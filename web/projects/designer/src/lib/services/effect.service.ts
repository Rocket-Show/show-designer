import { Injectable } from '@angular/core';
import { Effect } from './../models/effect';
import { Subject } from 'rxjs';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { EffectPixel } from '../models/effect-pixel';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { PresetStepEffectAmount } from '../models/preset-step-effect-amount';
import { UuidService } from './uuid.service';

@Injectable({
  providedIn: 'root',
})
export class EffectService {
  // The currently selected effect
  selectedEffect: Effect;

  // The effects are currently being edited
  effectsOpen: boolean = false;
  effectsOpenChanged: Subject<void> = new Subject<void>();

  // fires, when the effects of the preset changed in a way which changes the channels they
  // drive: an effect has been added, deleted, hidden, shown, or aimed at other channels
  effectsChanged: Subject<void> = new Subject<void>();

  constructor(private uuidService: UuidService) {}

  // A new effect of the preset, selected to be edited. Once the preset runs through more
  // than one step, it runs in the passed step only, the one being edited: a step brings
  // its own effects the way it brings its own values.
  addEffect(preset: Preset, effect: Effect, step?: PresetStep) {
    this.selectedEffect = effect;

    if (preset) {
      preset.effects.push(effect);

      if (preset.steps.length > 1 && preset.steps.indexOf(step) >= 0) {
        for (const otherStep of preset.steps) {
          if (otherStep !== step) {
            this.setEffectAmount(otherStep, effect, 0);
          }
        }
      }
    }

    this.effectsChanged.next();
  }

  // an effect deleted from the preset, and with it what its steps say about it
  deleteEffect(preset: Preset, effect: Effect) {
    const index = preset.effects.indexOf(effect);

    if (index < 0) {
      return;
    }

    preset.effects.splice(index, 1);

    for (const step of preset.steps) {
      step.effectAmounts = step.effectAmounts.filter((effectAmount) => effectAmount.effectUuid !== effect.uuid);
    }

    this.effectsChanged.next();
  }

  // whether the effect runs in the passed step, however much of it the step lets through
  // (without a step, as in a preset without any, it runs)
  runsInStep(step: PresetStep, effect: Effect): boolean {
    return !step || step.getEffectAmount(effect.uuid) > 0;
  }

  // let the effect run fully in the passed step, or silence it there
  setRunsInStep(step: PresetStep, effect: Effect, runs: boolean) {
    this.setEffectAmount(step, effect, runs ? 1 : 0);
    this.effectsChanged.next();
  }

  // a step only writes down the effects it does not let through fully
  private setEffectAmount(step: PresetStep, effect: Effect, amount: number) {
    step.effectAmounts = step.effectAmounts.filter((effectAmount) => effectAmount.effectUuid !== effect.uuid);

    if (amount < 1) {
      const effectAmount = new PresetStepEffectAmount();
      effectAmount.effectUuid = effect.uuid;
      effectAmount.amount = amount;
      step.effectAmounts.push(effectAmount);
    }
  }

  // a copy of an effect, placed right below the one it was copied from and selected to
  // be edited. It runs alongside the original: the steps of the preset let it through
  // the same way they do the effect it was copied from.
  duplicateEffect(preset: Preset, effect: Effect): Effect {
    const index = preset.effects.indexOf(effect);

    if (index < 0) {
      return undefined;
    }

    const copy = this.copyOf(effect);

    if (!copy) {
      return undefined;
    }

    copy.uuid = this.uuidService.getUuid();
    preset.effects.splice(index + 1, 0, copy);

    for (const step of preset.steps) {
      const effectAmount = step.effectAmounts.find((amount) => amount.effectUuid === effect.uuid);

      // a step which says nothing about the original lets the copy run fully as well
      if (!effectAmount) {
        continue;
      }

      const copyAmount = new PresetStepEffectAmount();
      copyAmount.effectUuid = copy.uuid;
      copyAmount.amount = effectAmount.amount;
      step.effectAmounts.push(copyAmount);
    }

    this.selectedEffect = copy;
    this.effectsChanged.next();

    return copy;
  }

  // an effect of the same type, holding the same settings
  private copyOf(effect: Effect): Effect {
    const data = JSON.parse(JSON.stringify(effect));

    switch (effect.type) {
      case 'curve':
        return new EffectCurve(data);
      case 'pan-tilt':
        return new EffectPanTilt(data);
      case 'pixel':
        return new EffectPixel(data);
    }

    return undefined;
  }
}
