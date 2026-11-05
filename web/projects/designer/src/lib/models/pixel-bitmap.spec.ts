import { decodeBase64, encodeBase64, PixelBitmap } from './pixel-bitmap';

describe('PixelBitmap', () => {
  // a picture of 2 x 2 pixels, red, green and blue each
  const bytes = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30]);

  it('reads the bytes of its pixels, row by row, and none beyond them', () => {
    const bitmap = new PixelBitmap({ width: 2, height: 2, channels: 3, frames: [encodeBase64(bytes)] });
    const frame = bitmap.frame(0);

    expect([bitmap.value(frame, 1, 0, 1), bitmap.value(frame, 0, 1, 2), bitmap.value(frame, 1, 1, 0)]).toEqual([255, 255, 10]);
    expect([bitmap.value(frame, 2, 0, 0), bitmap.value(frame, 0, -1, 0)]).toEqual([0, 0]);

    // a frame with less bytes than pixels, and one which can't be read
    const short = new PixelBitmap({ width: 2, height: 2, channels: 3, frames: [encodeBase64(bytes.slice(0, 4)), '!!!'] });
    expect(short.value(short.frame(0), 1, 1, 0)).toBe(0);
    expect(short.frame(1).length).toBe(0);
    expect(decodeBase64(undefined).length).toBe(0);
  });

  it('shows each frame of an animation as long as it lasts, a frame without a length for 100 ms', () => {
    const animation = new PixelBitmap({ width: 1, height: 1, frames: ['AA==', 'AA==', 'AA=='], durations: [100, 300, 0] });

    // 500 ms in all
    expect([0, 0.19, 0.2, 0.79, 0.8, 0.999].map((moment) => animation.frameAt(moment))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(new PixelBitmap({ frames: ['AA=='] }).frameAt(0.7)).toBe(0);
  });

  it('keeps what it is saved with, without the bytes it decoded', () => {
    const bitmap = new PixelBitmap({ width: 2, height: 2, channels: 3, frames: [encodeBase64(bytes)], letterStarts: [0] });
    bitmap.frame(0);

    expect(JSON.parse(JSON.stringify(bitmap))).toEqual({
      width: 2,
      height: 2,
      channels: 3,
      frames: [encodeBase64(bytes)],
      durations: [],
      letterStarts: [0],
    });
    // a picture of an unknown kind of pixels has a brightness for each
    expect(new PixelBitmap({ channels: 4 }).channels).toBe(1);
  });
});
