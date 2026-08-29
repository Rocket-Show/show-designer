// How a value moves from where it is to where it is heading: the curve maps the linear
// progress of a transition (0 = not started, 1 = arrived) to the part of the distance
// already covered. The preset and scene fades run it as well, which is why the same
// curve shapes a fade in, a fade out and a step transition alike.
export type TransitionCurveType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'snap';

export const transitionCurveTypes: TransitionCurveType[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'snap'];

export function applyTransitionCurve(curveType: string, position: number): number {
  // outside the transition there is nothing to shape (this also catches NaN)
  if (!(position > 0)) {
    return 0;
  }

  if (position >= 1) {
    return 1;
  }

  switch (curveType) {
    case 'ease-in':
      // creeps away from the old value and accelerates into the new one
      return position * position;
    case 'ease-out':
      // jumps away from the old value and settles into the new one
      return 1 - (1 - position) * (1 - position);
    case 'ease-in-out':
      // slow at both ends, fastest in the middle
      return position < 0.5 ? 2 * position * position : 1 - Math.pow(-2 * position + 2, 2) / 2;
    case 'snap':
      // holds the old value for the whole transition and jumps at the end of it
      return 0;
    default:
      // 'linear', and anything an older project may carry
      return position;
  }
}
