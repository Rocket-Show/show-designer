// The arc tangent, worked out the very same way as ArcTangent of Rocket Show: Math.atan2 of the browser and StrictMath
// of Java round differently in the last digit, which would point the moving heads aimed at a spot of the designer and
// the ones on stage a tiny bit apart. These are the polynomials of fdlibm (s_atan.c, e_atan2.c), with nothing but
// additions, multiplications and divisions, which give the same doubles on both sides.

const atanHi = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558];
const atanLo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];

const aT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1, 9.09088713343650656196e-2,
  -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.6531572744216915527e-2,
  1.62858201153657823623e-2,
];

const pi = 3.141592653589793116;
const piLo = 1.2246467991473531772e-16;

// the arc tangent of a number, between -π/2 and π/2
export function arcTangent(value: number): number {
  const sign = value < 0 ? -1 : 1;
  let x = Math.abs(value);
  let id: number;

  if (x >= 7.378697629483820646e19) {
    // beyond 2^66
    return sign * (atanHi[3] + atanLo[3]);
  }

  if (x < 0.4375) {
    if (x < 1.862645149230957e-9) {
      // below 2^-29
      return value;
    }

    id = -1;
  } else if (x < 1.1875) {
    if (x < 0.6875) {
      id = 0;
      x = (2 * x - 1) / (2 + x);
    } else {
      id = 1;
      x = (x - 1) / (x + 1);
    }
  } else if (x < 2.4375) {
    id = 2;
    x = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3;
    x = -1 / x;
  }

  const z = x * x;
  const w = z * z;
  const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));

  if (id < 0) {
    return value - value * (s1 + s2);
  }

  return sign * (atanHi[id] - (x * (s1 + s2) - atanLo[id] - x));
}

// the angle of the point (x, y) from the x axis, between -π and π, like Math.atan2
export function arcTangent2(y: number, x: number): number {
  if (x === 1) {
    return arcTangent(y);
  }

  if (y === 0) {
    return x < 0 ? (Object.is(y, -0) ? -pi : pi) : y;
  }

  if (x === 0) {
    return y < 0 ? -pi / 2 : pi / 2;
  }

  const z = arcTangent(Math.abs(y / x));

  if (x > 0) {
    return y < 0 ? -z : z;
  }

  return y < 0 ? z - piLo - pi : pi - (z - piLo);
}
