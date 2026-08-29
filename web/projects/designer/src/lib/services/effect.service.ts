import { Injectable } from '@angular/core';
import { Effect } from './../models/effect';
import { Subject } from 'rxjs';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { Preset } from '../models/preset';
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
    }

    return undefined;
  }
}
