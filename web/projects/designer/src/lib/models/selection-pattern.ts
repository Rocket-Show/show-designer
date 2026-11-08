// The pattern the fixtures of a preset are put in for its chases and for what it fans out over them in its own order
// (see Preset.patternGroupSize, patternWings and patternEvery): the place of a fixture in the order of the preset,
// grouped (the fixtures of a group take the same place), folded into wings (every other wing the other way round, so a
// chase runs out from the middle or in from both ends) and repeated every so many fixtures (every other fixture in one
// color, the others in another one). Rocket Show places them the very same way (SelectionPattern).
export interface PatternPlace {
  index: number;
  count: number;
}

// Where a fixture at the passed place in the order of its preset (of so many) is in the pattern: its index and the
// count of the places of the pattern. Without a pattern, where it is in the order of the preset.
export function getPatternPlace(index: number, count: number, groupSize: number, wings: number, every: number): PatternPlace {
  let patternIndex = index;
  let patternCount = count;

  const size = Math.max(Math.round(groupSize || 1), 1);

  if (size > 1) {
    patternIndex = Math.floor(patternIndex / size);
    patternCount = Math.ceil(patternCount / size);
  }

  const wingCount = Math.max(Math.round(wings || 1), 1);

  if (wingCount > 1 && patternCount > 1) {
    const wingSize = Math.ceil(patternCount / wingCount);
    const wing = Math.floor(patternIndex / wingSize);

    if (wing % 2 === 1) {
      // the other way round, from the end of the wing (the last wing ends with the last fixture)
      const wingEnd = Math.min((wing + 1) * wingSize, patternCount) - 1;
      patternIndex = wingEnd - patternIndex;
    } else {
      patternIndex = patternIndex - wing * wingSize;
    }

    patternCount = wingSize;
  }

  const repeat = Math.round(every || 0);

  if (repeat > 1 && patternCount > 1) {
    patternIndex = patternIndex % repeat;
    patternCount = Math.min(repeat, patternCount);
  }

  return { index: patternIndex, count: patternCount };
}

// does the preset put its fixtures in a pattern at all?
export function hasPattern(groupSize: number, wings: number, every: number): boolean {
  return Math.round(groupSize || 1) > 1 || Math.round(wings || 1) > 1 || Math.round(every || 0) > 1;
}
