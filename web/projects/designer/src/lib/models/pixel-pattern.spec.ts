import { band, fract, fractalNoise, hash, smoothStep, toInt, triangle, valueNoise } from './pixel-math';
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
