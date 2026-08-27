import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureChannelValue } from './fixture-channel-value';

// The values a preset applies at one point in time: either the values of a single step
// or, while a transition is running, the ones interpolated between two of them.
export class PresetStepState {
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
