import { averagedPixels, fittedPixelImageSize, imageBitmapOf, pixelImageBytes, pixelImageSize, PixelPicture } from './pixel-image';

// a picture of square pixels
const matrix = (columns: number, rows: number): PixelPicture => ({
  columns,
  rows,
  aspectX: columns / Math.max(columns, rows),
  aspectY: rows / Math.max(columns, rows),
});

describe('pixel images', () => {
  it('makes an image as large as the pixels it covers on its picture, so each one shows its own part of it', () => {
    // a square image on a square matrix: a pixel of it for each pixel
    expect(fittedPixelImageSize(800, 800, [matrix(8, 8)])).toEqual([8, 8]);
    // wider than the matrix: as high as it, and wider where it covers it
    expect(fittedPixelImageSize(1600, 400, [matrix(8, 8)])).toEqual([32, 8]);
    // a square image on a bar of 12 pixels covers it with as many pixels each way
    expect(fittedPixelImageSize(100, 100, [matrix(12, 1)])).toEqual([12, 12]);
    // the largest of the pictures counts
    expect(fittedPixelImageSize(800, 800, [matrix(8, 8), matrix(16, 8)])).toEqual([16, 16]);
  });

  it('makes no image larger than it is, nor than 128 pixels, and an image for no picture as large as by default', () => {
    expect(fittedPixelImageSize(4, 2, [matrix(16, 16)])).toEqual([4, 2]);
    expect(fittedPixelImageSize(2000, 1000, [{ columns: 300, rows: 100, aspectX: 1, aspectY: 1 / 3 }])).toEqual([128, 64]);
    expect(fittedPixelImageSize(640, 480, [])).toEqual([32, 24]);
    expect(pixelImageSize(640, 480, 64)).toEqual([64, 48]);
    // pixels of the stage further apart one way than the other
    expect(fittedPixelImageSize(400, 400, [{ columns: 10, rows: 2, aspectX: 1, aspectY: 1 }])).toEqual([10, 10]);
  });

  it('averages the part of the image drawn larger into each of its pixels, black where it is see-through', () => {
    // two pixels drawn twice as large: red and see-through on the left, white on the right
    const drawn = new Uint8ClampedArray([
      // the first row
      255, 0, 0, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255,
      // the second row
      255, 0, 0, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);

    expect(Array.from(averagedPixels(drawn, 2, 1, 2))).toEqual([128, 0, 0, 255, 255, 255]);
  });

  it('keeps a thin line of an image made much smaller, and tells how many bytes it takes', async () => {
    // a white line on black, a pixel wide
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#ffffff';
    context.fillRect(30, 0, 1, 64);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const sizes: number[][] = [];

    const bitmap = await imageBitmapOf(blob, (width, height) => {
      sizes.push([width, height]);
      return fittedPixelImageSize(width, height, [matrix(8, 8)]);
    });

    expect(sizes).toEqual([[64, 64]]);
    expect([bitmap.width, bitmap.height, bitmap.frames.length]).toEqual([8, 8, 1]);
    // in the fourth column, an eighth as bright as the line
    const frame = bitmap.frame(0);
    expect(bitmap.value(frame, 3, 4, 0)).toBeGreaterThan(20);
    expect(bitmap.value(frame, 5, 4, 0)).toBe(0);
    // 8 x 8 pixels of red, green and blue in base 64
    expect(pixelImageBytes(bitmap)).toBe(256);
  });
});
