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
  // Unless the step starts at a time of its own, this is worked out from the step length
  // of the sequence (see layoutSteps). It is written down either way, so whatever plays
  // the preset reads the steps alone.
  startMillis = 0;

  // whether the step starts at the time above instead of taking its place on the time
  // grid of the sequence (see getAutomaticStartMillis)
  ownStart = false;

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
    this.ownStart = data.ownStart === true;
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

// how long a step of a sequence lasts while nothing else is set: a second each
export const defaultStepsLengthMillis = 1000;

// Where the step at the passed index starts while it does not start at a time of its
// own: as many step lengths of the sequence after the start of the preset as there are
// steps before it, which keeps the steps on the time grid of the sequence.
export function getAutomaticStartMillis(index: number, lengthMillis: number): number {
  return index * lengthMillis;
}

// Works out the starts of the steps from the step length of their sequence. A step with
// a start of its own keeps it, the others take their place on the grid of the sequence.
// The steps are kept in the order they start in, so a step moved before or past others
// takes its place among them, and the others close up around it.
export function layoutSteps(steps: PresetStep[], lengthMillis: number) {
  // A step taking its place among others moves the ones it passes to another place on
  // the grid, which can pass another step in turn: this settles after as many passes as
  // there are steps at the most.
  for (let pass = 0; pass <= steps.length; pass++) {
    let ordered = true;

    steps.forEach((step, index) => {
      if (!step.ownStart) {
        step.startMillis = getAutomaticStartMillis(index, lengthMillis);
      }

      if (index > 0 && step.startMillis < steps[index - 1].startMillis) {
        ordered = false;
      }
    });

    if (ordered) {
      return;
    }

    // sorting keeps steps starting at the same time in the order they were in
    steps.sort((step1, step2) => step1.startMillis - step2.startMillis);
  }
}

// The step length of a sequence written before the designer knew one, and which of its
// steps start at a time of their own. Of the times its steps are apart, the one which
// puts the most of them on its grid is taken, and all of them stay where they are.
export function adoptStepsLength(steps: PresetStep[]): number {
  let lengthMillis = defaultStepsLengthMillis;
  let highestCount = -1;

  for (let i = 1; i < steps.length; i++) {
    const gapMillis = steps[i].startMillis - steps[i - 1].startMillis;

    if (gapMillis <= 0) {
      continue;
    }

    const count = steps.filter((step, index) => step.startMillis === getAutomaticStartMillis(index, gapMillis)).length;

    // on a tie, the time reached first
    if (count > highestCount) {
      highestCount = count;
      lengthMillis = gapMillis;
    }
  }

  steps.forEach((step, index) => {
    step.ownStart = step.startMillis !== getAutomaticStartMillis(index, lengthMillis);
  });

  return lengthMillis;
}
