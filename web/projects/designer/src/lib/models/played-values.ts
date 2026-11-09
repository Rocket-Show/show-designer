// The values of a step a preset plays: all of them but the ones turned off in the preset editor (deactivated), which
// the step keeps to turn them on again, e.g. after a venue they didn't suit. The same array if none of them is off, as
// every frame reads them. This follows the same rules as Rocket Show.
export function playedValues<T extends { deactivated?: boolean }>(values: T[]): T[] {
  return values.some((value) => value.deactivated) ? values.filter((value) => !value.deactivated) : values;
}
