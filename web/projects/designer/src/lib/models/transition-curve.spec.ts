import { applyTransitionCurve } from './transition-curve';

describe('applyTransitionCurve', () => {
  it('should pass a linear transition through unchanged', () => {
    expect(applyTransitionCurve('linear', 0.25)).toBe(0.25);
    expect(applyTransitionCurve('linear', 0.5)).toBe(0.5);
  });

  it('should clamp outside the transition', () => {
    expect(applyTransitionCurve('ease-in-out', -1)).toBe(0);
    expect(applyTransitionCurve('ease-in-out', 0)).toBe(0);
    expect(applyTransitionCurve('ease-in-out', 1)).toBe(1);
    expect(applyTransitionCurve('ease-in-out', 2)).toBe(1);
  });

  it('should treat a missing position as not started', () => {
    expect(applyTransitionCurve('linear', NaN)).toBe(0);
    expect(applyTransitionCurve('linear', undefined)).toBe(0);
  });

  it('should start slowly when easing in and quickly when easing out', () => {
    expect(applyTransitionCurve('ease-in', 0.5)).toBeLessThan(0.5);
    expect(applyTransitionCurve('ease-out', 0.5)).toBeGreaterThan(0.5);
  });

  it('should be symmetric around the middle when easing in and out', () => {
    expect(applyTransitionCurve('ease-in-out', 0.5)).toBeCloseTo(0.5, 10);
    expect(applyTransitionCurve('ease-in-out', 0.25) + applyTransitionCurve('ease-in-out', 0.75)).toBeCloseTo(1, 10);
  });

  it('should rise without ever falling back', () => {
    for (const curveType of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'snap']) {
      let previous = 0;

      for (let position = 0; position <= 1.0001; position += 0.05) {
        const value = applyTransitionCurve(curveType, position);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('should hold the old value for a whole snapping transition', () => {
    expect(applyTransitionCurve('snap', 0.01)).toBe(0);
    expect(applyTransitionCurve('snap', 0.99)).toBe(0);
    expect(applyTransitionCurve('snap', 1)).toBe(1);
  });

  it('should fall back to linear for a curve it does not know', () => {
    expect(applyTransitionCurve('from-a-newer-designer', 0.4)).toBe(0.4);
  });
});
