import { browserFontBitmap, PIXEL_FONT, pixelFontBitmap, pixelFontHas, textBitmap } from './pixel-text';

// the rows of a text in the pixel font, a # for each lit pixel
function rows(text: string): string[] {
  const bitmap = pixelFontBitmap(text);
  const frame = bitmap.frame(0);

  return Array.from({ length: bitmap.height }, (_, y) =>
    Array.from({ length: bitmap.width }, (__, x) => (bitmap.value(frame, x, y, 0) ? '#' : '.')).join('')
  );
}

describe('pixel text', () => {
  it('writes a text in the pixel font, a letter as narrow as it is and a column between two', () => {
    expect(rows('Hi')).toEqual(['#...#..#.', '#...#....', '#...#.##.', '#####..#.', '#...#..#.', '#...#..#.', '#...#.###']);
    // where each letter starts, for the colors of the letters
    expect(pixelFontBitmap('Hi').letterStarts).toEqual([0, 6]);
  });

  it('has the letters of the languages of the designer, and a question mark for one it does not have', () => {
    expect(['Ä', 'é', 'ñ', 'ç', 'ß', '€', '♥'].every((letter) => pixelFontHas(letter))).toBe(true);
    expect(rows('漢')).toEqual(rows('?'));
    // a space of three columns
    expect(pixelFontBitmap(' ').width).toBe(3);
  });

  it('draws a text in a font of the browser as high as asked, on or off at each pixel', () => {
    const bitmap = browserFontBitmap('Hello', 'sans-serif', 10);
    const frame = bitmap.frame(0);
    const values = Array.from({ length: bitmap.width * bitmap.height }, (_, i) =>
      bitmap.value(frame, i % bitmap.width, Math.floor(i / bitmap.width), 0)
    );

    expect(bitmap.height).toBe(10);
    expect(bitmap.width).toBeGreaterThan(15);
    expect(values.some((value) => value === 255)).toBe(true);
    expect(values.every((value) => value === 0 || value === 255)).toBe(true);
    expect(bitmap.letterStarts.length).toBe(5);
    expect(browserFontBitmap('', 'serif', 8).width).toBe(0);
  });

  it('takes the font an effect has', () => {
    expect(textBitmap('A', PIXEL_FONT, 12).height).toBe(7);
    expect(textBitmap('A', 'serif', 12).height).toBe(12);
  });
});
