// The sine over a cycle, sin(2π · cyclePosition), worked out the very same way as CycleSine of Rocket
// Show: Math.sin of the browser and the ones of Java round differently in the last digit, which would
// let the curves of the designer and the ones on stage drift apart. The cycle is reduced to a quarter
// around its nearest multiple of 90° and the sine or the cosine of what is left is taken from the
// polynomials of fdlibm (__kernel_sin, __kernel_cos), with nothing but additions and multiplications,
// which give the same doubles on both sides.

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

// the sine of an angle between -π/4 and π/4
function sine(angle: number, squared: number): number {
  const cubed = squared * angle;
  const rest = S2 + squared * (S3 + squared * (S4 + squared * (S5 + squared * S6)));
  return angle + cubed * (S1 + squared * rest);
}

// the cosine of an angle between -π/4 and π/4
function cosine(squared: number): number {
  const rest = squared * (C1 + squared * (C2 + squared * (C3 + squared * (C4 + squared * (C5 + squared * C6)))));
  return 1 - (0.5 * squared - squared * rest);
}

export function cycleSine(cyclePosition: number): number {
  // the nearest quarter of the cycle and the angle left from it
  const quarter = Math.floor(cyclePosition * 4 + 0.5);
  const angle = 2 * Math.PI * (cyclePosition - quarter / 4);
  const squared = angle * angle;

  switch ((((quarter % 4) + 4) % 4) as number) {
    case 0:
      return sine(angle, squared);
    case 1:
      return cosine(squared);
    case 2:
      return -sine(angle, squared);
    default:
      return -cosine(squared);
  }
}
