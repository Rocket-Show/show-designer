import { hash, toInt } from './pixel-math';
import { Preset } from './preset';
import { getStepsLoopMillis } from './preset-step';

// The order the steps of a preset are played in. 'forward' plays them the way they are written down, the others take
// each step for as long as it lasts written down, in another order:
// - 'backward' plays them from the last one to the first
// - 'pingpong' plays them forward and back again, without playing the steps at both ends twice in a row
// - 'random' plays each of them once per pass, shuffled anew for every pass, and never the same step twice in a row
// PresetSteps of Rocket Show plays them the very same way.
export type StepsOrder = 'forward' | 'backward' | 'pingpong' | 'random';
export const stepsOrders: StepsOrder[] = ['forward', 'backward', 'pingpong', 'random'];

// whether the steps are played in another order than they are written down in (an order this designer doesn't know
// plays them forward, like in Rocket Show)
export function isStepsOrdered(preset: Preset): boolean {
  return preset.stepsOrder === 'backward' || preset.stepsOrder === 'pingpong' || preset.stepsOrder === 'random';
}

// How long each step lasts the way the steps are written down: until the next one starts, the last one for the rest of
// a pass.
export function getStepLengths(preset: Preset): number[] {
  const steps = preset.steps;

  if (!steps || steps.length === 0) {
    return [];
  }

  const loopEndMillis = steps[0].startMillis + getStepsLoopMillis(steps, preset.stepsLoopMillis);

  return steps.map((step, index) => (index < steps.length - 1 ? steps[index + 1].startMillis : loopEndMillis) - step.startMillis);
}

// the steps which last any time, which are the ones a sequence played in another order reaches
function getPlayableIndices(lengths: number[]): number[] {
  const indices: number[] = [];

  lengths.forEach((length, index) => {
    if (length > 0) {
      indices.push(index);
    }
  });

  return indices;
}

// The playable steps shuffled for a pass, the same for the same seed and pass: from the last place to the first, each
// place swaps with one of the places before it or itself.
function shuffle(indices: number[], seed: number, pass: number): number[] {
  const shuffled = indices.slice();

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(hash(toInt(pass), toInt(seed), i) * (i + 1));
    const swap = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = swap;
  }

  return shuffled;
}

// The steps a pass of the sequence plays, by their index in the preset, in the order they are played in. Only a
// random order is different from one pass to the next.
export function getStepsOrderIndices(preset: Preset, pass = 0): number[] {
  const indices = getPlayableIndices(getStepLengths(preset));

  switch (preset.stepsOrder) {
    case 'backward':
      return indices.reverse();
    case 'pingpong': {
      // back again without the last step, which was just played. A sequence which starts over leaves out the first
      // step as well, which the next pass opens with. One which doesn't ends on it.
      const back = indices.slice(0, -1).reverse();
      return indices.concat(preset.stepsLoop ? back.slice(0, -1) : back);
    }
    case 'random': {
      if (indices.length < 3) {
        // two steps can only take turns
        return indices;
      }

      const shuffled = shuffle(indices, preset.stepsSeed, pass);

      // A pass doesn't open with the step the one before it ended with. Swapping the first two leaves the last step of
      // a pass where it is, so the pass before can be shuffled on its own to find it.
      const previousLast = shuffle(indices, preset.stepsSeed, pass - 1)[indices.length - 1];

      if (shuffled[0] === previousLast) {
        shuffled[0] = shuffled[1];
        shuffled[1] = previousLast;
      }

      return shuffled;
    }
    default:
      return indices;
  }
}

// The length of a pass of the sequence: the time it takes to play the steps once in their order, which is what a
// sequence which loops starts over after.
export function getStepsPassMillis(preset: Preset): number {
  if (!isStepsOrdered(preset)) {
    return getStepsLoopMillis(preset.steps, preset.stepsLoopMillis);
  }

  const lengths = getStepLengths(preset);
  let passMillis = 0;

  for (const index of getStepsOrderIndices(preset)) {
    passMillis += lengths[index];
  }

  return passMillis;
}

// The time the steps of a preset have run for, from the time it has played for: as it is for steps timed as written
// down, as much faster or slower as the tempo played is than the one they are written at for steps following the beat.
// Rocket Show works it out the same way (PresetSteps.getStepsTimeMillis).
export function getStepsTimeMillis(preset: Preset, presetTimeMillis: number, beatsPerMinute: number): number {
  if (preset.stepsLengthMode !== 'beats' || !(preset.stepsBeatsPerMinute > 0) || !(beatsPerMinute > 0)) {
    return presetTimeMillis;
  }

  return (presetTimeMillis * beatsPerMinute) / preset.stepsBeatsPerMinute;
}
