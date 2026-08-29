import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureChannelValue } from './fixture-channel-value';
import { PresetStepEffectAmount } from './preset-step-effect-amount';
import { TransitionCurveType } from './transition-curve';

// One state of a preset. A preset holds at least one step and runs through them over
// its playing time; a preset with a single step is the static look it has always been.
export class PresetStep {
  uuid: string;

  // when this step starts, relative to the start of the preset. It is what the preset
  // shows from that millisecond (and with it from that beat) until the next step
  // starts, and the transition into it runs over the beginning of that time.
  startMillis = 0;

  // how long the values travel from the previous step into this one, counted from the
  // start of this step: undefined = the whole time this step lasts, 0 = a jump
  transitionMillis: number;
  transitionCurve: TransitionCurveType = 'linear';

  // the selected values
  fixtureChannelValues: FixtureChannelValue[] = [];
  fixtureCapabilityValues: FixtureCapabilityValue[] = [];

  // how much of each effect of the preset this step lets through
  effectAmounts: PresetStepEffectAmount[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.startMillis = data.startMillis || 0;
    this.transitionMillis = data.transitionMillis === null ? undefined : data.transitionMillis;
    this.transitionCurve = data.transitionCurve || 'linear';

    if (data.fixtureChannelValues) {
      for (const fixtureChannelValue of data.fixtureChannelValues) {
        this.fixtureChannelValues.push(new FixtureChannelValue(fixtureChannelValue));
      }
    }
    if (data.fixtureCapabilityValues) {
      for (const fixtureCapabilityValue of data.fixtureCapabilityValues) {
        this.fixtureCapabilityValues.push(new FixtureCapabilityValue(fixtureCapabilityValue));
      }
    }
    if (data.effectAmounts) {
      for (const effectAmount of data.effectAmounts) {
        this.effectAmounts.push(new PresetStepEffectAmount(effectAmount));
      }
    }
  }

  // how much of the passed effect this step lets through (effects a step says nothing
  // about run fully, which is what a preset without any step settings did before)
  public getEffectAmount(effectUuid: string): number {
    for (const effectAmount of this.effectAmounts) {
      if (effectAmount.effectUuid === effectUuid) {
        return effectAmount.amount;
      }
    }

    return 1;
  }
}

// Where the transition into a step ends: it begins as the step does and travels from
// the step before it over the whole time this step lasts, unless the step carries a
// shorter time of its own. A transition never runs past the step which follows it.
export function getTransitionEndMillis(step: PresetStep, startMillis: number, endMillis: number): number {
  if (endMillis === undefined || endMillis <= startMillis) {
    return startMillis;
  }

  if (step.transitionMillis === undefined) {
    return endMillis;
  }

  return Math.min(startMillis + step.transitionMillis, endMillis);
}

// The length of one pass through the passed steps. Without a length of its own, the
// last step holds as long as the one before it lasted, which loops an evenly spaced
// chase the way it is written down.
export function getStepsLoopMillis(steps: PresetStep[], loopMillis?: number): number {
  if (loopMillis !== undefined && loopMillis > 0) {
    return loopMillis;
  }

  if (!steps || steps.length < 2) {
    return 0;
  }

  const last = steps[steps.length - 1];
  const previous = steps[steps.length - 2];

  return last.startMillis - steps[0].startMillis + (last.startMillis - previous.startMillis);
}
