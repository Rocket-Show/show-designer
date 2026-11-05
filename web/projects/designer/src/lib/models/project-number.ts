// A number of a project, also one saved as text: earlier designers saved a few of the values
// typed in that way (a channel value, the tempo and the grid of a composition). Rocket Show
// reads such a text as the number it is, surrounding spaces allowed, and an empty one as none.
export function readProjectNumber(value: any): number {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed === '' ? undefined : Number(trimmed);
}
