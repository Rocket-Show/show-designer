// The arithmetic of the pixel effects, worked out the very same way as PixelMath of Rocket Show: nothing but the basic
// operations, Math.floor, Math.abs, Math.min, Math.max and Math.sqrt (exact on both sides), cycleSine and arcTangent2,
// in the same order, so the browser and Java come to the very same doubles. What looks random comes from a hash of
// whole numbers, never from Math.random: a moment of an effect always looks the same, while scrubbing the timeline and
// on stage.

export function clamp01(value: number): number {
  return Math.max(Math.min(value, 1), 0);
}

// the part of a number after its whole cycles, between 0 and 1 (also for a negative one)
export function fract(value: number): number {
  return value - Math.floor(value);
}

// up from 0 to 1 over the first half of each cycle, back down over the second
export function triangle(value: number): number {
  return 1 - Math.abs(2 * fract(value) - 1);
}

// 0 below from, 1 above to and a smooth step in between. A step of no width jumps at from.
export function smoothStep(from: number, to: number, value: number): number {
  if (!(to > from)) {
    return value < from ? 0 : 1;
  }

  const t = clamp01((value - from) / (to - from));

  return t * t * (3 - 2 * t);
}

// 1 within halfWidth of a point, 0 beyond, softened over edge on both sides of the border
export function band(distance: number, halfWidth: number, edge: number): number {
  return 1 - smoothStep(halfWidth - edge, halfWidth + edge, distance);
}

// a whole number as a 32 bit integer, cut off and wrapped around like Java casts it through a long
export function toInt(value: number): number {
  return value | 0;
}

// A number between 0 and 1 which looks random, the same for the same three whole numbers (a pixel, a moment and what
// it is for). The multiplications wrap around at 32 bits, like the ones of int in Java.
export function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1440670441)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
}

// a smooth landscape of values between 0 and 1: random heights on the whole numbers, smoothly blended in between
export function valueNoise(x: number, y: number): number {
  const xFloor = Math.floor(x);
  const yFloor = Math.floor(y);
  const xi = toInt(xFloor);
  const yi = toInt(yFloor);
  const xf = x - xFloor;
  const yf = y - yFloor;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, 7);
  const b = hash(xi + 1, yi, 7);
  const c = hash(xi, yi + 1, 7);
  const d = hash(xi + 1, yi + 1, 7);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// the landscape with finer ones laid over it, for the look of flames and clouds
export function fractalNoise(x: number, y: number): number {
  return valueNoise(x, y) * 0.55 + valueNoise(x * 2.03 + 17.1, y * 2.03 + 5.3) * 0.3 + valueNoise(x * 4.1 + 3.7, y * 4.1 + 11.9) * 0.15;
}
