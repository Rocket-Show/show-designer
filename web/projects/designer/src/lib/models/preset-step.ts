import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureChannelValue } from './fixture-channel-value';
import { PresetStepEffectAmount } from './preset-step-effect-amount';
import { TransitionCurveType } from './transition-curve';

// One state of a preset. A preset holds at least one step and runs through them over
// its playing time; a preset with a single step is the static look it has always been.
export class PresetStep {
  uuid: string;
  name: string;

  // when this step is fully reached, relative to the start of the preset. The
  // transition runs over the time before it, so a step lands on its millisecond (and
  // with it on its beat) instead of only starting to move there.
  startMillis = 0;

  // how the values travel from the previous step to this one (0 = jump)
  transitionMillis = 0;
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
    this.name = data.name;
    this.startMillis = data.startMillis || 0;
    this.transitionMillis = data.transitionMillis || 0;
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
