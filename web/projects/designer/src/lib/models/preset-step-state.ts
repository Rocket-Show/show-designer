import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureChannelValue } from './fixture-channel-value';
import { PresetStep } from './preset-step';

// The values a preset applies at one point in time: either the values of a single step
// or, while a transition is running, the ones interpolated between two of them.
export class PresetStepState {
  // the step reached last, which is the one a preset is on while it plays
  currentStep: PresetStep;

  // how far it has come from that step towards the next one, between 0 and 1. Only the
  // designer reads this, to fill the step it is on as it goes.
  currentStepProgress = 0;

  fixtureChannelValues: FixtureChannelValue[] = [];
  fixtureCapabilityValues: FixtureCapabilityValue[] = [];

  // how much of each effect of the preset is let through, by effect uuid. Effects
  // missing from the map run fully.
  effectAmounts: Map<string, number> = new Map();

  public getEffectAmount(effectUuid: string): number {
    const amount = this.effectAmounts.get(effectUuid);

    return amount === undefined ? 1 : amount;
  }
}
