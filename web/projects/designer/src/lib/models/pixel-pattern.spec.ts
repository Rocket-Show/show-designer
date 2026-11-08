import { band, fract, fractalNoise, hash, smoothStep, toInt, triangle, valueNoise } from './pixel-math';
import { encodeBase64, PixelBitmap } from './pixel-bitmap';
import { PixelContext, PixelPatternSettings, pixelPatterns, samplePixelPattern } from './pixel-pattern';

function settings(pattern: string, extra: Partial<PixelPatternSettings> = {}): PixelPatternSettings {
  return { pattern, size: 0.2, softness: 0, direction: 'right', shape: 'circle', bounce: false, ...extra };
}

// the pixel at a column and a row of a grid of pixels (a bar has one row)
function pixel(column: number, columns: number, row = 0, rows = 1, seed = 0): PixelContext {
  const context = new PixelContext();
  context.x = (column + 0.5) / columns;
  context.y = (row + 0.5) / rows;
  context.column = column;
  context.row = row;
  context.columns = columns;
  context.rows = rows;
  context.aspectX = columns / Math.max(columns, rows);
  context.aspectY = rows / Math.max(columns, rows);
  context.seed = seed;
  return context;
}

// how bright each pixel of a bar is at a moment
function levels(pattern: PixelPatternSettings, cycle: number, columns = 10): number[] {
  return Array.from(
    { length: columns },
    (_, column) => Math.round(samplePixelPattern(pattern, cycle, pixel(column, columns))[1] * 100) / 100
  );
}

// the pixels of a bar lit at least halfway
function lit(pattern: PixelPatternSettings, cycle: number, columns = 10): number[] {
  return levels(pattern, cycle, columns)
    .map((level, column) => (level >= 0.5 ? column : -1))
    .filter((column) => column >= 0);
}

describe('pixel patterns', () => {
  it('runs a block of pixels along a bar, and the other way round', () => {
    expect(lit(settings('chase'), 0.5)).toEqual([4, 5]);
    expect(lit(settings('chase'), 0.75)).toEqual([7, 8]);
    expect(lit(settings('chase', { direction: 'left' }), 0.75)).toEqual([1, 2]);
    // from the middle out to both ends
    expect(lit(settings('chase', { direction: 'out' }), 0.75)).toEqual([0, 1, 8, 9]);
  });

  it('takes the next color of the palette for every pass of a chase', () => {
    const pattern = settings('chase');

    expect(samplePixelPattern(pattern, 0.5, pixel(4, 10))[0]).toBe(0);
    expect(samplePixelPattern(pattern, 1.5, pixel(4, 10))[0]).toBe(0.2);
  });

  it('softens the edges of a block', () => {
    const hard = levels(settings('chase', { size: 0.4 }), 0.5);
    const soft = levels(settings('chase', { size: 0.4, softness: 1 }), 0.5);

    expect(hard.filter((level) => level > 0 && level < 1).length).toBe(0);
    expect(soft.filter((level) => level > 0 && level < 1).length).toBeGreaterThan(2);
  });

  it('draws a comet with its head brightest and a tail which fades behind it', () => {
    const comet = settings('comet', { size: 0.5 });
    const bar = levels(comet, 0.5);

    // the head is at 75 % of the bar, the tail reaches back half of it
    expect(bar[7]).toBeGreaterThan(bar[5]);
    expect(bar[5]).toBeGreaterThan(bar[3]);
    expect(bar[1]).toBe(0);
    expect(bar[9]).toBe(0);
    expect(samplePixelPattern(comet, 0.5, pixel(7, 10))[0]).toBeGreaterThan(samplePixelPattern(comet, 0.5, pixel(4, 10))[0]);
  });

  it('lets a comet bounce back with its tail behind it', () => {
    const comet = settings('comet', { size: 0.3, bounce: true });

    // on the way back, its head at 40 % of the bar: the tail is to the right of it
    const back = levels(comet, 0.8);

    expect(back[4]).toBeGreaterThan(back[6]);
    expect(back[6]).toBeGreaterThan(0);
    expect(back[8]).toBe(0);
    expect(back[1]).toBe(0);
  });

  it('paints the next color of the palette over the last one with a wipe', () => {
    const wipe = settings('wipe', { size: 0.4 });

    // halfway through the first pass: the left half carries the next color already
    expect(samplePixelPattern(wipe, 0.5, pixel(1, 10))[0]).toBeCloseTo(0.39, 5);
    expect(samplePixelPattern(wipe, 0.5, pixel(8, 10))[0]).toBe(0);
    expect(levels(wipe, 0.5)).toEqual(Array(10).fill(1));
  });

  it('moves the palette along the pixels with a flow', () => {
    const flow = settings('flow', { size: 0.5 });
    const now = samplePixelPattern(flow, 0, pixel(5, 10))[0];

    expect(samplePixelPattern(flow, 0.25, pixel(5, 10))[0]).toBeCloseTo(now - 0.25, 10);
    expect(samplePixelPattern(flow, 0, pixel(6, 10))[0]).toBeGreaterThan(now);
  });

  it('lets pixels sparkle, the same way at the same moment, others with another seed', () => {
    const sparkle = settings('sparkle', { size: 0.5, softness: 0.5 });
    const moments = [0.1, 0.35, 0.6, 2.85, 17.3];
    const sparkles = (seed: number) =>
      moments.map((cycle) =>
        Array.from({ length: 30 }, (_, column) => samplePixelPattern(sparkle, cycle, pixel(column, 30, 0, 1, seed))[1])
      );

    expect(sparkles(0)).toEqual(sparkles(0));
    expect(sparkles(5)).not.toEqual(sparkles(0));
    // a few of them are lit, never all
    const litCount = [].concat(...sparkles(0)).filter((level: number) => level > 0).length;
    expect(litCount).toBeGreaterThan(5);
    expect(litCount).toBeLessThan(120);
    expect(levels(settings('sparkle', { size: 0 }), 0.3, 30).filter((level) => level > 0).length).toBeLessThan(5);
  });

  it('fills a matrix with clouds of all the colors of a plasma', () => {
    const places: number[] = [];

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const [place, level] = samplePixelPattern(settings('plasma', { size: 0.5 }), 0.3, pixel(column, 8, row, 8));
        places.push(place);
        expect(level).toBe(1);
      }
    }

    expect(Math.min(...places)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...places)).toBeLessThanOrEqual(1);
    expect(Math.max(...places) - Math.min(...places)).toBeGreaterThan(0.2);
  });

  it('spreads rings out from the middle of a matrix', () => {
    const ripple = settings('ripple', { size: 0.3, softness: 0.3 });
    const ringAt = (cycle: number) => {
      const row = Array.from({ length: 16 }, (_, column) => samplePixelPattern(ripple, cycle, pixel(column, 16, 8, 16))[1]);
      return row.indexOf(Math.max(...row.slice(8)), 8);
    };

    expect(ringAt(0.6)).toBeGreaterThan(ringAt(0.3));
  });

  it('grows a shape out of the middle, which fades on its way', () => {
    const circle = settings('shapes', { size: 0.1 });
    const level = (cycle: number, column: number) => samplePixelPattern(circle, cycle, pixel(column, 16, 8, 16))[1];

    // the circle is a fifth of the way out, then nearly at the edge
    expect(level(0.15, 9)).toBeGreaterThan(0.5);
    expect(level(0.15, 14)).toBe(0);
    expect(level(0.6, 14)).toBeGreaterThan(0.3);
    expect(level(0.6, 14)).toBeLessThan(level(0.15, 9));
  });

  it('knows the outlines of its shapes', () => {
    const outline = (shape: string, column: number, row: number) => {
      const context = pixel(column, 16, row, 16);
      return samplePixelPattern(settings('shapes', { shape, size: 0.2 }), 0.5, context)[1] > 0.3;
    };

    // halfway, the outline is two thirds of the way out: on the axes of a square and a diamond, on the corner of a square only
    expect(outline('square', 13, 8)).toBe(true);
    expect(outline('square', 13, 13)).toBe(true);
    expect(outline('diamond', 14, 8)).toBe(true);
    expect(outline('diamond', 13, 13)).toBe(false);
  });

  it('draws a star and a heart in shapes of their own', () => {
    const outline = (shape: string) =>
      Array.from(
        { length: 16 * 16 },
        (_, i) => samplePixelPattern(settings('shapes', { shape, size: 0.1 }), 0.5, pixel(i % 16, 16, Math.floor(i / 16), 16))[1] > 0.3
      );

    expect(outline('star')).not.toEqual(outline('circle'));
    expect(outline('heart')).not.toEqual(outline('circle'));
    expect(outline('heart')).not.toEqual(outline('star'));
    expect(outline('heart').filter((on) => on).length).toBeGreaterThan(8);
  });

  it('lets flames rise from the bottom of a matrix and embers flicker on a bar', () => {
    const fire = settings('fire', { size: 0.5 });
    const heat = (row: number) =>
      Array.from({ length: 8 }, (_, column) => samplePixelPattern(fire, 0.4, pixel(column, 8, row, 8))[1]).reduce(
        (sum, level) => sum + level,
        0
      );

    expect(heat(7)).toBeGreaterThan(heat(0));
    expect(levels(fire, 0.4, 12).some((level) => level > 0)).toBe(true);
    expect(levels(fire, 0.4, 12)).not.toEqual(levels(fire, 0.9, 12));
  });

  it('runs pulses from the middle out to the ends, or in from them', () => {
    const out = (cycle: number) => levels(settings('center', { size: 0.3, direction: 'out' }), cycle);
    const inwards = (cycle: number) => levels(settings('center', { size: 0.3, direction: 'in' }), cycle);

    // the middle first, the ends later
    expect(out(0.1)[4]).toBeGreaterThan(out(0.1)[0]);
    expect(out(0.9)[0]).toBeGreaterThan(out(0.9)[4]);
    expect(inwards(0.1)[0]).toBeGreaterThan(inwards(0.1)[4]);
    // both halves alike
    expect(out(0.4).slice(0, 5)).toEqual(out(0.4).slice(5).reverse());
  });

  it('marches stripes along, a pixel further after the time it takes', () => {
    const stripes = settings('stripes', { size: 0.2 });
    // a stripe and the gap after it take 0.18 of the bar, a pixel of 24 is 1/24 of it
    const shift = 1 / (24 * 0.18);
    const before = levels(stripes, 0.3, 24);
    const after = levels(stripes, 0.3 + shift, 24);

    expect(after.slice(1)).toEqual(before.slice(0, 23));
    // several of them, each in a color of its own
    expect(lit(stripes, 0.3, 24).length).toBeGreaterThan(6);
    expect(samplePixelPattern(stripes, 0.3, pixel(0, 24))[0]).not.toBe(samplePixelPattern(stripes, 0.3, pixel(12, 24))[0]);
  });

  it('drops pixels one by one onto a stack at the far end, until all of them are there', () => {
    const stack = settings('stack');

    // the first one dropping from the near end
    expect(lit(stack, 0.1, 4)).toEqual([1]);
    // the first one piled up at the far end, the second one dropping
    expect(lit(stack, 0.3, 4)).toEqual([1, 3]);
    expect(lit(stack, 0.9, 4)).toEqual([0, 1, 2, 3]);
    // piling up at the other end
    expect(lit(settings('stack', { direction: 'left' }), 0.3, 4)).toEqual([0, 2]);
  });

  it('turns a beam around the middle of a matrix with a trail behind it, either way', () => {
    // at a quarter of a turn the beam points down: the pixel below the middle just before it is lit, the one after it
    // not yet
    const before = pixel(4, 8, 7, 8);
    const after = pixel(3, 8, 7, 8);

    expect(samplePixelPattern(settings('sweep'), 0.25, before)[1]).toBeGreaterThan(0.5);
    expect(samplePixelPattern(settings('sweep'), 0.25, after)[1]).toBe(0);
    expect(samplePixelPattern(settings('sweep', { direction: 'ccw' }), -0.25, after)[1]).toBeGreaterThan(0.5);
    expect(samplePixelPattern(settings('sweep', { direction: 'ccw' }), -0.25, before)[1]).toBe(0);
  });

  it('turns as many arms of a spiral as its size asks for', () => {
    // the arms crossed on a ring around the middle
    const arms = (size: number) => {
      let crossed = 0;
      let wasLit = false;

      for (let step = 0; step <= 360; step++) {
        const point = new PixelContext();
        point.x = 0.5 + 0.35 * Math.cos((step / 360) * 2 * Math.PI);
        point.y = 0.5 + 0.35 * Math.sin((step / 360) * 2 * Math.PI);
        point.columns = 16;
        point.rows = 16;
        const isLit = samplePixelPattern(settings('spiral', { size }), 0.3, point)[1] >= 0.5;

        if (isLit && !wasLit && step > 0) {
          crossed++;
        }
        wasLit = isLit;
      }

      return crossed;
    };

    expect(arms(0)).toBe(1);
    expect(arms(0.2)).toBe(2);
    expect(arms(1)).toBe(6);
  });

  it('swaps the squares of a checkerboard every half period', () => {
    const board = settings('checker', { size: 0 });
    const square = (column: number, row: number, cycle: number) => samplePixelPattern(board, cycle, pixel(column, 4, row, 4))[1];

    expect([square(0, 0, 0.25), square(1, 0, 0.25), square(1, 1, 0.25)]).toEqual([1, 0, 1]);
    expect([square(0, 0, 0.75), square(1, 0, 0.75), square(1, 1, 0.75)]).toEqual([0, 1, 0]);
    // larger squares of two pixels each
    const large = (column: number) => samplePixelPattern(settings('checker', { size: 0.2 }), 0.25, pixel(column, 4, 0, 4))[1];
    expect([large(0), large(1), large(2), large(3)]).toEqual([1, 1, 0, 0]);
    // the two colors at the ends of the palette
    expect(samplePixelPattern(board, 0.25, pixel(1, 4, 0, 4))[0]).toBe(1);
  });

  it('lets drops of rain fall down the columns', () => {
    const rain = settings('rain', { size: 0.3 });
    const column = 3;
    const speed = 0.6 + hash(column, 0, 3) * 0.9;
    // a row further down after the time the drop takes for it
    const step = 1 / 16 / ((1 + 0.15 + 0.3 * 0.6) * speed);
    const at = (row: number, cycle: number) => Math.round(samplePixelPattern(rain, cycle, pixel(column, 8, row, 16))[1] * 1e9) / 1e9;

    for (const row of [4, 7, 10]) {
      expect(at(row + 1, 0.4 + step)).toBeCloseTo(at(row, 0.4), 6);
    }
  });

  it('flies the frames of a tunnel outwards', () => {
    const tunnel = settings('tunnel', { size: 0.4 });
    const depth = 0.25 + 0.4 * 0.75;
    // two pixels right of the middle (a row through it), the frame at the inner one reaching the outer one later
    const inner = pixel(12, 16, 7, 15);
    const outer = pixel(14, 16, 7, 15);
    const later = depth / (0.5625 + 0.15) - depth / (0.8125 + 0.15);

    const [innerPlace, innerLevel] = samplePixelPattern(tunnel, 0.2, inner);
    const [outerPlace, outerLevel] = samplePixelPattern(tunnel, 0.2 + later, outer);
    expect(outerLevel).toBeCloseTo(innerLevel, 9);
    expect(outerPlace).toBeCloseTo(innerPlace, 9);
  });

  it('moves the dot of an orbit along the path of a movement', () => {
    // the brightest pixel of a matrix of 16 x 16
    const brightest = (shape: string, cycle: number) => {
      let best = [0, 0];
      let level = -1;

      for (let row = 0; row < 16; row++) {
        for (let column = 0; column < 16; column++) {
          const sampled = samplePixelPattern(settings('orbit', { shape }), cycle, pixel(column, 16, row, 16))[1];

          if (sampled > level) {
            level = sampled;
            best = [column, row];
          }
        }
      }

      return best;
    };

    // a circle starts at the top and goes round to the right
    expect(brightest('circle', 0)).toEqual([7, 2]);
    expect(brightest('circle', 0.25)).toEqual([13, 7]);
    // a figure 8 is up again a quarter of the way
    expect(brightest('figure8', 0.125)[1]).toBe(2);
  });

  it('fills a matrix up to a curve running along it, and shows the curve on a bar', () => {
    // a sawtooth, a quarter of a period across the bar
    const sawtooth = settings('wave', { size: 1, shape: 'sawtooth' });
    expect(samplePixelPattern(sawtooth, 0, pixel(0, 10))[1]).toBeCloseTo(0.08 + 0.84 * 0.02, 12);

    // a square wave fills a column up to the top or leaves it nearly empty
    const square = settings('wave', { size: 1, shape: 'square' });
    const filled = (column: number, cycle: number) =>
      Array.from({ length: 8 }, (_, row) => samplePixelPattern(square, cycle, pixel(column, 8, row, 8))[1] >= 0.5).filter((isLit) => isLit)
        .length;

    expect(filled(0, 0.7)).toBe(7);
    expect(filled(0, 0.2)).toBe(1);
  });

  it('scrolls a text of a pixel for each pixel through a matrix, or shows it aligned', () => {
    // a text of 4 x 2 pixels: the first and the last column lit
    const bitmap = new PixelBitmap({
      width: 4,
      height: 2,
      frames: [encodeBase64(new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255]))],
      letterStarts: [0, 2],
    });
    const text = (extra: any = {}) => settings('text', { bitmap, ...extra });
    // the columns of the top row of a matrix of 6 x 2 which are lit
    const litColumns = (pattern: PixelPatternSettings, cycle: number) =>
      [0, 1, 2, 3, 4, 5].filter((column) => samplePixelPattern(pattern, cycle, pixel(column, 6, 0, 2))[1] > 0);

    // through the whole matrix in a period, coming in on the right
    expect(litColumns(text(), 0)).toEqual([]);
    expect(litColumns(text(), 0.1)).toEqual([5]);
    expect(litColumns(text(), 0.5)).toEqual([1, 4]);
    expect(litColumns(text({ scroll: 'right' }), 0.5)).toEqual([1, 4]);
    // still in the middle, on the left or on the right
    expect(litColumns(text({ scroll: 'none' }), 0.3)).toEqual([1, 4]);
    expect(litColumns(text({ scroll: 'none', align: 'left' }), 0.3)).toEqual([0, 3]);
    expect(litColumns(text({ scroll: 'none', align: 'right' }), 0.3)).toEqual([2, 5]);

    // the colors along the text, of its letters or one
    const at = (extra: any) => samplePixelPattern(text({ scroll: 'none', align: 'left', ...extra }), 0, pixel(3, 6, 0, 2))[0];
    expect([at({}), at({ textColors: 'letters' }), at({ textColors: 'one' })]).toEqual([0.75, 0.34, 0]);
  });

  it('fits an image into the pixels in its own colors, or its brightness through the palette', () => {
    // an image of 2 x 1 pixels, red and blue
    const bitmap = new PixelBitmap({ width: 2, height: 1, channels: 3, frames: [encodeBase64(new Uint8Array([255, 0, 0, 0, 0, 255]))] });
    const image = (extra: any = {}) => settings('image', { bitmap, ...extra });
    // a matrix of 4 x 4: the image is as wide, half as high in the middle
    const at = (pattern: PixelPatternSettings, column: number, row: number) => samplePixelPattern(pattern, 0, pixel(column, 4, row, 4));

    expect(at(image(), 0, 0)).toEqual([0, 0]);
    expect(at(image(), 0, 1)).toEqual([0, 1, 1, 0, 0]);
    expect(at(image(), 3, 2)).toEqual([0, 1, 0, 0, 1]);
    // filling it, stretched over it
    expect(at(image({ fit: 'cover' }), 0, 0)).toEqual([0, 1, 1, 0, 0]);
    expect(at(image({ fit: 'stretch' }), 1, 3)).toEqual([0, 1, 1, 0, 0]);
    // through the palette by how bright it is
    expect(at(image({ imageColors: 'palette' }), 0, 1)).toEqual([0.299, 1]);
    // scrolling around: half a period later the other side
    expect(samplePixelPattern(image({ fit: 'stretch', scroll: 'left' }), 0.5, pixel(0, 4, 0, 4))).toEqual([0, 1, 0, 0, 1]);

    // an image in shades of gray lights red, green and blue alike, none lights nothing
    const gray = new PixelBitmap({ width: 1, height: 1, channels: 1, frames: [encodeBase64(new Uint8Array([102]))] });
    const [, lit, red, green, blue] = samplePixelPattern(settings('image', { bitmap: gray }), 0, pixel(0, 1));
    expect(lit).toBe(1);
    expect(red).toBeCloseTo(0.4, 3);
    expect([green, blue]).toEqual([red, red]);
    expect(samplePixelPattern(settings('image'), 0, pixel(0, 1))).toEqual([0, 0]);
  });

  it('runs through the frames of an animation in a period', () => {
    const animation = new PixelBitmap({
      width: 1,
      height: 1,
      channels: 3,
      frames: [encodeBase64(new Uint8Array([255, 0, 0])), encodeBase64(new Uint8Array([0, 255, 0]))],
      durations: [100, 300],
    });
    const color = (cycle: number) => samplePixelPattern(settings('image', { bitmap: animation }), cycle, pixel(0, 1)).slice(2);

    expect([color(0.2), color(0.3), color(1.2)]).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
    ]);
    // nothing to show without a picture
    expect(samplePixelPattern(settings('text'), 0.5, pixel(0, 1))).toEqual([0, 0]);
  });

  it('leaves the pixels dark for a pattern of a newer designer', () => {
    expect(samplePixelPattern(settings('fireworks'), 0.5, pixel(3, 10))).toEqual([0, 0]);
    expect(pixelPatterns).toContain('fire');
  });
});

describe('pixel math', () => {
  it('works out the parts of a cycle, also of a negative one', () => {
    expect(fract(2.25)).toBe(0.25);
    expect(fract(-0.25)).toBe(0.75);
    expect(triangle(0.25)).toBe(0.5);
    expect(triangle(0.5)).toBe(1);
    expect(triangle(1)).toBe(0);
  });

  it('steps smoothly, and jumps where the step has no width', () => {
    expect(smoothStep(0, 1, 0.5)).toBe(0.5);
    expect(smoothStep(0, 1, -1)).toBe(0);
    expect(smoothStep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothStep(0.5, 0.5, 0.5)).toBe(1);
    expect(band(0.1, 0.2, 0.05)).toBe(1);
    expect(band(0.3, 0.2, 0.05)).toBe(0);
  });

  it('cuts a number to 32 bits like Java does', () => {
    expect(toInt(3.9)).toBe(3);
    expect(toInt(-3.9)).toBe(-3);
    expect(toInt(2 ** 32 + 5)).toBe(5);
  });

  it('hashes whole numbers to the same number between 0 and 1 each time', () => {
    const values = Array.from({ length: 1000 }, (_, i) => hash(i, i * 3, 7));

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
    expect(hash(1, 2, 3)).not.toBe(hash(2, 1, 3));
    // spread over the whole range
    expect(values.filter((value) => value < 0.5).length).toBeGreaterThan(400);
    expect(values.filter((value) => value < 0.5).length).toBeLessThan(600);
  });

  it('makes smooth noise, which meets the hash on the whole numbers', () => {
    expect(valueNoise(3, 4)).toBe(hash(3, 4, 7));
    expect(Math.abs(valueNoise(3.5, 4) - valueNoise(3.51, 4))).toBeLessThan(0.05);
    expect(fractalNoise(1.3, 2.7)).toBeGreaterThanOrEqual(0);
    expect(fractalNoise(1.3, 2.7)).toBeLessThan(1);
  });
});
