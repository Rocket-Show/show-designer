import { arcTangent2 } from './arc-tangent';
import { cycleSine } from './cycle-sine';
import { band, clamp01, fract, fractalNoise, hash, smoothStep, toInt, triangle } from './pixel-math';

// What a pixel effect sets for its pattern (see EffectPixel)
export interface PixelPatternSettings {
  pattern: string;

  // how big the pattern is (a block, a tail, rings, ...), between 0 and 1. What it means depends on the pattern.
  size: number;

  // how soft its edges are, between 0 (hard) and 1
  softness: number;

  // where it runs to: 'right', 'left', 'out' (from the middle), 'in' (to the middle), 'up' and 'down'
  direction: string;

  // the shape of the shapes: 'circle', 'square', 'diamond', 'star' or 'heart'
  shape: string;

  // whether a comet runs back and forth instead of starting over
  bounce: boolean;
}

// Where a pixel is: its place in the picture (x from the left to the right, y from the top to the bottom, both from 0 to
// 1, the middle of the pixel), the column and the row it is in and how many there are. A bar is a matrix with one row.
// The aspect says how wide and high the picture is, the longer side being 1.
export class PixelContext {
  x = 0.5;
  y = 0.5;
  column = 0;
  row = 0;
  columns = 1;
  rows = 1;
  aspectX = 1;
  aspectY = 1;

  // a whole number the random looking patterns start from (of the effect and the fixture)
  seed = 0;
}

// the patterns a pixel effect can show, made for bars and made for matrices (each of them plays on both)
export const pixelPatternsForBars = ['chase', 'comet', 'wipe', 'flow', 'sparkle'];
export const pixelPatternsForMatrices = ['plasma', 'ripple', 'shapes', 'fire'];
export const pixelPatterns = [...pixelPatternsForBars, ...pixelPatternsForMatrices];

const fullCycle = 2 * Math.PI;

// how far along the direction a pixel is, from 0 to 1
function along(context: PixelContext, direction: string): number {
  switch (direction) {
    case 'left':
      return 1 - context.x;
    case 'up':
      return 1 - context.y;
    case 'down':
      return context.y;
    case 'out':
      return Math.abs(context.x - 0.5) * 2;
    case 'in':
      return 1 - Math.abs(context.x - 0.5) * 2;
    default:
      return context.x;
  }
}

// how many pixels there are along the direction, to soften an edge over at least half of one
function pixelsAlong(context: PixelContext, direction: string): number {
  return direction === 'up' || direction === 'down' ? context.rows : context.columns;
}

// Is the picture a matrix, rather than a bar? A matrix has rows, which are not much shorter than its columns.
function isMatrix(context: PixelContext): boolean {
  return context.rows > 1 && context.aspectY > 0.2;
}

// how far a point (from the middle, -1 to 1 on each axis, up being positive) is out in a shape: 1 on its outline
function shapeDistance(x: number, y: number, shape: string): number {
  switch (shape) {
    case 'square':
      return Math.max(Math.abs(x), Math.abs(y));
    case 'diamond':
      return (Math.abs(x) + Math.abs(y)) * 0.72;
    case 'star': {
      const angle = arcTangent2(y, x) / fullCycle;
      // five points, one of them up
      const outline = 0.62 + 0.38 * cycleSine(5 * (angle - 0.25) + 0.25);

      return (Math.sqrt(x * x + y * y) / outline) * 0.78;
    }
    case 'heart': {
      const angle = fract(arcTangent2(y, x) / fullCycle);
      const outline = heartOutline[Math.floor(angle * heartOutline.length) % heartOutline.length];

      return Math.sqrt(x * x + y * y) / outline;
    }
    default:
      return Math.sqrt(x * x + y * y);
  }
}

// The outline of a heart, as how far it is from its middle in each of 180 directions (the longest one being 1), worked
// out once from (x² + y² - 1)³ = x² y³ by halving the distance until it is found
const heartOutline = ((): number[] => {
  const inside = (x: number, y: number) => {
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  };
  const directions = 180;
  const outline: number[] = [];
  let longest = 0;

  for (let i = 0; i < directions; i++) {
    const angle = i / directions;
    const dx = cycleSine(angle + 0.25);
    const dy = cycleSine(angle);
    let low = 0;
    let high = 2;

    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;

      if (inside(dx * middle, 0.12 + dy * middle)) {
        low = middle;
      } else {
        high = middle;
      }
    }

    outline.push(low);
    longest = Math.max(longest, low);
  }

  return outline.map((distance) => distance / longest);
})();

// A pattern at a pixel and a moment: where it puts the pixel in the palette (any number, the palette repeats) and how
// bright the pixel is, between 0 and 1. The moment is counted in periods of the effect since it started. Rocket Show
// does the very same (PixelPatterns).
export function samplePixelPattern(settings: PixelPatternSettings, cycle: number, context: PixelContext): number[] {
  const size = settings.size;
  const softness = settings.softness;
  const direction = settings.direction;

  switch (settings.pattern) {
    case 'chase': {
      // a block running along, every pass in the next color
      const position = along(context, direction);
      const width = Math.max(size, 0.02);
      const middle = fract(cycle) * (1 + width) - width / 2;
      const edge = Math.max(softness * width * 0.5, 0.5 / pixelsAlong(context, direction));

      return [Math.floor(cycle) * 0.2, band(Math.abs(position - middle), width / 2, edge)];
    }
    case 'comet': {
      // a head with a tail fading behind it through the palette
      const position = along(context, direction);
      const tail = Math.max(size, 0.05);
      let behind: number;

      if (settings.bounce) {
        const head = triangle(cycle);
        behind = fract(cycle) < 0.5 ? head - position : position - head;
      } else {
        behind = fract(cycle) * (1 + tail) - position;
      }

      if (behind < 0) {
        // a glow in front of the head, over about a pixel
        const pixels = behind * pixelsAlong(context, direction);
        const glow = Math.max(0, 1 - pixels * pixels * 0.8);

        return [1, glow * glow];
      }

      if (behind > tail) {
        return [0, 0];
      }

      const left = 1 - behind / tail;

      return [left, left * left];
    }
    case 'wipe': {
      // the next color of the palette paints over the last one
      const position = along(context, direction);
      const edge = Math.max(softness * 0.2, 0.5 / pixelsAlong(context, direction));
      const progress = fract(cycle);
      const painted = 1 - smoothStep(progress - edge, progress + edge, position * (1 - 2 * edge) + edge);

      return [(Math.floor(cycle) + painted) * (0.15 + size * 0.6), 1];
    }
    case 'flow':
      // the palette moving along
      return [along(context, direction) * (0.35 + (1 - size) * 2.2) - cycle, 1];
    case 'sparkle': {
      // pixels flashing up at random and fading out
      const column = toInt(context.column + context.seed);
      const offset = cycle * 2 + hash(column, context.row, 11);
      const slot = Math.floor(offset);
      const sinceFlash = offset - slot;
      const slotNumber = toInt(slot);

      if (hash(column, context.row, toInt(slotNumber * 7 + 3)) >= size * 0.65 + 0.04) {
        return [0, 0];
      }

      const fade = 0.15 + softness * 0.85;
      const left = clamp01(1 - (sinceFlash - 0.04) / fade);

      return [hash(column, context.row, toInt(slotNumber * 13 + 5)), sinceFlash < 0.04 ? sinceFlash / 0.04 : left * left];
    }
    case 'plasma': {
      // soft clouds of color drifting and swirling, the scale in periods of the sine across the picture
      const scale = 0.5 + (1 - size) * 1.0;
      const x = context.x * scale * context.aspectX;
      const y = context.y * scale * context.aspectY;
      const dx = x - scale / 2;
      const dy = y - scale / 2;
      const value =
        cycleSine(x + cycle) +
        cycleSine(y * 0.9 - cycle * 0.7 + 0.16) +
        cycleSine((x + y) * 0.7 + cycle * 0.5) +
        cycleSine(Math.sqrt(dx * dx + dy * dy) * 1.3 - cycle);

      return [value / 8 + 0.5, 1];
    }
    case 'ripple': {
      // rings spreading out from the middle
      const dx = (context.x - 0.5) * context.aspectX;
      const dy = (context.y - 0.5) * context.aspectY;
      const distance = Math.sqrt(dx * dx + dy * dy) * 1.4142135623730951;
      const ring = fract(distance * (0.8 + size * 3) - cycle);
      const tail = 0.15 + softness * 0.7;

      return [distance, smoothStep(0, 0.06, 1 - ring) * smoothStep(1 - tail, 1, ring)];
    }
    case 'shapes': {
      // an outline growing out of the middle and fading
      const x = (context.x - 0.5) * 2 * context.aspectX;
      const y = -(context.y - 0.5) * 2 * context.aspectY;
      const distance = shapeDistance(x, y, settings.shape);
      const progress = fract(cycle);
      const width = 0.1 + size * 0.45;
      const edge = 0.03 + softness * 0.18;

      return [
        Math.floor(cycle) * 0.27 + distance * 0.25,
        band(Math.abs(distance - progress * 1.35), width / 2, edge) * (1 - progress * 0.55),
      ];
    }
    case 'fire': {
      // flames rising from the bottom, embers flickering on a bar
      const offset = (context.seed % 997) * 1.37;

      if (!isMatrix(context)) {
        const noise = fractalNoise(
          context.x * 3 * context.aspectX * Math.max(1, context.columns / 12) + offset,
          cycle * 2.2 + context.y * 3
        );
        const heat = clamp01((noise - 0.22) * 1.8);

        return [heat * 0.92, clamp01(heat * 1.35)];
      }

      const height = 1 - context.y;
      const noise = fractalNoise(context.x * 3.2 * context.aspectX + offset, height * 2.6 * context.aspectY - cycle * 2.4);
      const heat = clamp01(noise * 1.3 - height * (1.15 - size * 0.65) + 0.12);

      return [heat, clamp01(heat * 1.7)];
    }
    default:
      // a pattern of a newer designer
      return [0, 0];
  }
}
