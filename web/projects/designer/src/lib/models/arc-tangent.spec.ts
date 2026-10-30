import { arcTangent, arcTangent2 } from './arc-tangent';

// The arc tangent of fdlibm, which Rocket Show works out the very same way (ArcTangent)
describe('arc-tangent', () => {
  it('should come out like the arc tangent of fdlibm', () => {
    // the values of fdlibm (and of Java's StrictMath) for these, to the last digit
    expect(arcTangent2(0.9267919362380059, 0.37557516814108993)).toBe(1.1857790291288564);
    expect(arcTangent(1)).toBe(Math.PI / 4);
    expect(arcTangent(-1)).toBe(-Math.PI / 4);
  });

  it('should stay within a digit of the arc tangent of the browser', () => {
    for (let i = 0; i < 500; i++) {
      const y = Math.sin(i * 1.7) * Math.pow(10, (i % 7) - 3);
      const x = Math.cos(i * 2.3) * Math.pow(10, (i % 5) - 2);

      expect(Math.abs(arcTangent2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-15 * Math.max(Math.abs(Math.atan2(y, x)), 1));
    }
  });

  it('should take every range of numbers and the axes', () => {
    for (const x of [1e-12, 0.1, 0.5, 0.9, 1.5, 3, 1e30]) {
      expect(Math.abs(arcTangent(x) - Math.atan(x))).toBeLessThan(1e-15);
      expect(Math.abs(arcTangent(-x) + Math.atan(x))).toBeLessThan(1e-15);
    }

    expect(arcTangent2(0, 1)).toBe(0);
    expect(arcTangent2(0, -1)).toBe(Math.PI);
    expect(arcTangent2(-0, -1)).toBe(-Math.PI);
    expect(arcTangent2(1, 0)).toBe(Math.PI / 2);
    expect(arcTangent2(-1, 0)).toBe(-Math.PI / 2);
    expect(arcTangent2(-1, -1)).toBeCloseTo((-3 * Math.PI) / 4, 15);
    expect(arcTangent2(1, -1)).toBeCloseTo((3 * Math.PI) / 4, 15);
  });
});
