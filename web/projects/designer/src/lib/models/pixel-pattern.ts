import { arcTangent2 } from './arc-tangent';
import { cycleSine } from './cycle-sine';
import { PixelBitmap } from './pixel-bitmap';
import { band, clamp01, fract, fractalNoise, hash, smoothStep, toInt, triangle } from './pixel-math';

// What a pixel effect sets for its pattern (see EffectPixel)
export interface PixelPatternSettings {
  pattern: string;

  // how big the pattern is (a block, a tail, rings, ...), between 0 and 1. What it means depends on the pattern.
  size: number;

  // how soft its edges are, between 0 (hard) and 1
  softness: number;

  // where it runs to: 'right', 'left', 'out' (from the middle), 'in' (to the middle), 'up' and 'down', or which way it
  // turns: 'cw' (clockwise, the default) and 'ccw'
  direction: string;

  // the shape of the shapes and the tunnel: 'circle', 'square', 'diamond', 'star' or 'heart'. The path of the orbit:
  // 'circle', 'figure8', 'line' or 'wave', and the curve of the wave: 'sine', 'triangle', 'square' or 'sawtooth'.
  shape: string;

  // whether a comet runs back and forth instead of starting over
  bounce: boolean;

  // the picture of a text or an image (see PixelBitmap), and how it is shown: how it scrolls ('left', 'right', 'up',
  // 'down' or 'none', 'auto' for the way of the pattern: a text to the left, an image not), where a text which does
  // not scroll is aligned ('left', 'center' or 'right'), how many pixels a text is moved up, how an image is fitted
  // into the pixels ('contain', 'cover', 'stretch' or 'pixels', one of the image for each) and their colors: of a
  // text 'along' it, of its 'letters' or 'one', of an image its 'own' or its brightness through the 'palette'
  bitmap?: PixelBitmap;
  scroll?: string;
  align?: string;
  offsetY?: number;
  fit?: string;
  textColors?: string;
  imageColors?: string;
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
export const pixelPatternsForBars = ['chase', 'comet', 'wipe', 'flow', 'sparkle', 'center', 'stripes', 'stack'];
export const pixelPatternsForMatrices = [
  'plasma',
  'ripple',
  'shapes',
  'fire',
  'sweep',
  'spiral',
  'checker',
  'rain',
  'tunnel',
  'orbit',
  'wave',
  'text',
  'image',
];
export const pixelPatterns = [...pixelPatternsForBars, ...pixelPatternsForMatrices];

// What a pattern lets be set besides its size: the directions it runs in (the first one is where it runs without
// one), its shapes, whether its softness makes it fade or trail and whether it bounces
export interface PixelPatternOptions {
  // a pattern without a size (it fills the pixels one by one)
  withoutSize?: boolean;
  directions?: string[];
  shapes?: string[];
  softness?: 'softness' | 'fade' | 'trail';
  bounce?: boolean;
}

const runs = ['right', 'left', 'out', 'in', 'up', 'down'];
const turns = ['cw', 'ccw'];
const outlines = ['circle', 'square', 'diamond', 'star', 'heart'];

export const pixelPatternOptions: { [pattern: string]: PixelPatternOptions } = {
  chase: { directions: runs, softness: 'softness' },
  comet: { directions: runs, bounce: true },
  wipe: { directions: runs, softness: 'softness' },
  flow: { directions: runs },
  sparkle: { softness: 'fade' },
  center: { directions: ['out', 'in'], softness: 'softness' },
  stripes: { directions: runs, softness: 'softness' },
  stack: { withoutSize: true, directions: ['right', 'left', 'up', 'down'] },
  plasma: {},
  ripple: { softness: 'softness' },
  shapes: { shapes: outlines, softness: 'softness' },
  fire: {},
  sweep: { directions: turns },
  spiral: { directions: turns, softness: 'softness' },
  checker: { softness: 'softness' },
  rain: {},
  tunnel: { shapes: outlines, softness: 'softness' },
  orbit: { shapes: ['circle', 'figure8', 'line', 'wave'], softness: 'trail' },
  wave: { directions: ['right', 'left'], shapes: ['sine', 'triangle', 'square', 'sawtooth'] },
  text: { withoutSize: true },
  image: { withoutSize: true },
};

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

// where the dot of an orbit is at a moment of its period, from -1 to 1 on each axis (up being positive): the shapes
// of the movements of the moving heads (see EffectPanTilt)
function orbitPoint(shape: string, moment: number): number[] {
  switch (shape) {
    case 'figure8':
      return [cycleSine(moment), cycleSine(moment * 2)];
    case 'line':
      return [cycleSine(moment), cycleSine(moment)];
    case 'wave':
      return [cycleSine(moment), cycleSine(moment * 3)];
    default:
      return [cycleSine(moment), cycleSine(moment + 0.25)];
  }
}

// a curve of a wave at a moment of its period, between 0 and 1
function waveCurve(shape: string, moment: number): number {
  switch (shape) {
    case 'triangle':
      return triangle(moment);
    case 'square':
      return moment < 0.5 ? 1 : 0;
    case 'sawtooth':
      return moment;
    default:
      return 0.5 + 0.5 * cycleSine(moment);
  }
}

// the place of a pixel counted from the end a stack piles up at, in pixels (whole numbers)
function stackIndex(context: PixelContext, direction: string): number {
  switch (direction) {
    case 'left':
      return context.column;
    case 'up':
      return context.row;
    case 'down':
      return context.rows - 1 - context.row;
    default:
      return context.columns - 1 - context.column;
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

// Where a pixel shows a text: the column and the row of the text in the picture. The text moves a pixel at a time,
// through the whole picture in a period, or stands aligned in it.
function textPosition(settings: PixelPatternSettings, cycle: number, context: PixelContext, bitmap: PixelBitmap): number[] {
  const scroll = !settings.scroll || settings.scroll === 'auto' ? 'left' : settings.scroll;
  const across = Math.floor(fract(cycle) * (bitmap.width + context.columns));
  const down = Math.floor(fract(cycle) * (bitmap.height + context.rows));
  const top = Math.floor((context.rows - bitmap.height) / 2) - toInt(settings.offsetY || 0);
  let x: number;

  switch (settings.align) {
    case 'left':
      x = context.column;
      break;
    case 'right':
      x = context.column - (context.columns - bitmap.width);
      break;
    default:
      x = context.column - Math.floor((context.columns - bitmap.width) / 2);
  }

  switch (scroll) {
    case 'right':
      return [context.column - across + bitmap.width, context.row - top];
    case 'up':
      return [x, context.row + down - context.rows];
    case 'down':
      return [x, context.row - down + bitmap.height];
    case 'none':
      return [x, context.row - top];
    default:
      return [context.column + across - context.columns, context.row - top];
  }
}

// Where a pixel shows an image, from 0 to 1 on each axis (outside of it beyond): fitted into the picture whole
// ('contain', with dark edges where it is narrower), filling it ('cover'), stretched over it or one pixel of the
// image for each pixel ('pixels', in the middle), scrolling around (an image which leaves the picture on one side
// comes in on the other)
function imagePosition(settings: PixelPatternSettings, cycle: number, context: PixelContext, bitmap: PixelBitmap): number[] {
  let u = context.x;
  let v = context.y;
  const pictureRatio = context.aspectY > 0 ? context.aspectX / context.aspectY : context.columns;
  const imageRatio = bitmap.width / bitmap.height;

  switch (settings.fit) {
    case 'cover':
      if (imageRatio > pictureRatio) {
        u = (u - 0.5) * (pictureRatio / imageRatio) + 0.5;
      } else {
        v = (v - 0.5) * (imageRatio / pictureRatio) + 0.5;
      }
      break;
    case 'stretch':
      break;
    case 'pixels':
      u = (context.column - Math.floor((context.columns - bitmap.width) / 2) + 0.5) / bitmap.width;
      v = (context.row - Math.floor((context.rows - bitmap.height) / 2) + 0.5) / bitmap.height;
      break;
    default:
      if (imageRatio > pictureRatio) {
        v = (v - 0.5) * (imageRatio / pictureRatio) + 0.5;
      } else {
        u = (u - 0.5) * (pictureRatio / imageRatio) + 0.5;
      }
  }

  switch (settings.scroll) {
    case 'left':
      return [fract(u + cycle), v];
    case 'right':
      return [fract(u - cycle), v];
    case 'up':
      return [u, fract(v + cycle)];
    case 'down':
      return [u, fract(v - cycle)];
    default:
      return [u, v];
  }
}

// A pattern at a pixel and a moment: where it puts the pixel in the palette (any number, the palette repeats) and how
// bright the pixel is, between 0 and 1. An image showing its own colors gives the color of the pixel as well (red,
// green and blue, between 0 and 1), in place of the palette. The moment is counted in periods of the effect since it
// started. Rocket Show does the very same (PixelPatterns).
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
    case 'center': {
      // pulses running from the middle out to the ends (or the edges of a matrix), or in from them
      const dx = (context.x - 0.5) * 2 * context.aspectX;
      const dy = (context.y - 0.5) * 2 * context.aspectY;
      const distance = isMatrix(context) ? Math.min(1, Math.sqrt(dx * dx + dy * dy)) : Math.abs(context.x - 0.5) * 2;
      const position = direction === 'in' ? 1 - distance : distance;
      const width = Math.max(size, 0.03);
      const middle = fract(cycle) * (1 + width) - width / 2;
      const edge = Math.max(softness * width * 0.5, 1 / Math.max(context.columns, context.rows));

      return [Math.floor(cycle) * 0.25 + position * 0.3, band(Math.abs(position - middle), width / 2, edge)];
    }
    case 'stripes': {
      // evenly spaced stripes marching along, each in its own color
      const spacing = 0.08 + size * 0.5;
      const stripes = along(context, direction) / spacing - cycle + 0.25;
      const edge = Math.max(0.04 + softness * 0.2, 0.5 / (pixelsAlong(context, direction) * spacing));

      return [Math.floor(stripes) * 0.17, band(Math.abs(fract(stripes) - 0.5), 0.25, edge)];
    }
    case 'stack': {
      // pixels dropping in one by one and piling up at the far end, until all of them are there (each row or column of
      // a matrix on its own)
      const count = Math.max(2, pixelsAlong(context, direction));
      const index = Math.min(count - 1, Math.max(0, stackIndex(context, direction)));
      const vertical = direction === 'up' || direction === 'down';
      const lane = isMatrix(context) ? hash(vertical ? context.column : 0, vertical ? 0 : context.row, 9) : 0;
      const progress = fract(cycle + lane);
      const steps = progress * (count + 1);
      const step = Math.floor(steps);
      const place = index / (count - 1);

      if (step >= count || index < step) {
        return [place, 1];
      }

      // the one dropping in, from the near end down to the pile
      const falling = count - 1 - (steps - step) * (count - 1 - step);

      return [place, index === Math.floor(falling + 0.5) ? 1 : 0];
    }
    case 'sweep': {
      // a beam turning around the middle with a trail behind it, like a radar
      const turn = arcTangent2((context.y - 0.5) * context.aspectY, (context.x - 0.5) * context.aspectX) / fullCycle;
      const behind = fract(cycle - (direction === 'ccw' ? -turn : turn));
      const trail = 0.12 + size * 0.7;
      const left = 1 - behind / trail;

      return [1 - (behind / trail) * 0.8, behind < trail ? left * left : 0];
    }
    case 'spiral': {
      // arms of a spiral turning and seeming to pull inwards
      const dx = (context.x - 0.5) * 2 * context.aspectX;
      const dy = (context.y - 0.5) * 2 * context.aspectY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const turn = arcTangent2(dy, dx) / fullCycle;
      const arms = Math.floor(1.5 + size * 5);
      const arm = fract(turn * arms + distance * 1.4 + (direction === 'ccw' ? cycle : -cycle));

      return [distance * 0.7, band(Math.abs(arm - 0.5), 0.25, 0.04 + softness * 0.22)];
    }
    case 'checker': {
      // squares swapping every half period, fading over to the other color where it is soft
      const cells = Math.floor(1.5 + size * 6);
      const odd = (Math.floor(context.column / cells) + Math.floor(context.row / cells)) % 2;
      const half = fract(cycle) < 0.5 ? 0 : 1;
      const fade = smoothStep(0, softness * 0.5 + 0.001, fract(cycle * 2));

      return [odd, odd === half ? fade : 1 - fade];
    }
    case 'rain': {
      // drops falling down the columns, each column at a speed of its own
      const column = toInt(context.column + context.seed);
      const speed = 0.6 + hash(column, 0, 3) * 0.9;
      const tail = 0.15 + size * 0.6;
      let brightest = 0;

      for (let drop = 0; drop < 2; drop++) {
        const behind = fract(cycle * speed + hash(column, drop, 5)) * (1 + tail) - context.y;

        if (behind >= 0 && behind < tail) {
          brightest = Math.max(brightest, 1 - behind / tail);
        }
      }

      return [brightest, brightest * brightest];
    }
    case 'tunnel': {
      // frames flying outwards, as if driving through a tunnel: the deeper the closer together
      const x = (context.x - 0.5) * 2 * context.aspectX;
      const y = -(context.y - 0.5) * 2 * context.aspectY;
      const distance = shapeDistance(x, y, settings.shape);
      const depth = (0.25 + size * 0.75) / (distance + 0.15) + cycle;
      const frame = band(Math.abs(fract(depth) - 0.5), 0.22, 0.05 + softness * 0.3);

      return [fract(Math.floor(depth) * 0.27), frame * clamp01(distance * 1.6 + 0.15)];
    }
    case 'orbit': {
      // a glowing dot moving along the shape of a movement of the moving heads, with a trail
      const radius = 0.08 + size * 0.25;
      const gap = 0.004 + softness * 0.03;
      let level = 0;
      let place = 0;

      for (let behind = 0; behind < 7; behind++) {
        const moment = fract(cycle - behind * gap);
        const point = orbitPoint(settings.shape, moment);
        const dx = (context.x - (0.5 + 0.36 * point[0])) * context.aspectX;
        const dy = (context.y - (0.5 - 0.36 * point[1])) * context.aspectY;
        const distance = Math.sqrt(dx * dx + dy * dy) / radius;
        const glow = clamp01(1 - distance * distance * 0.5);
        const weight = glow * glow * (1 - behind / 7);

        if (weight > level) {
          level = weight;
          place = moment;
        }
      }

      return [place, level];
    }
    case 'wave': {
      // a matrix filled up to a curve running along, a bar showing the curve itself
      const moment = fract(along(context, direction === 'left' ? 'left' : 'right') * (0.4 + (1 - size) * 2.2) - cycle);
      const value = 0.08 + 0.84 * waveCurve(settings.shape, moment);

      if (!isMatrix(context)) {
        return [value, value];
      }

      const height = 1 - context.y;
      const edge = 0.5 / context.rows;

      return [height, 1 - smoothStep(value - edge, value + edge, height)];
    }
    case 'text': {
      // a text of a pixel for each pixel, scrolling through the picture
      const bitmap = settings.bitmap;

      if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) {
        return [0, 0];
      }

      const [x, y] = textPosition(settings, cycle, context, bitmap);
      const value = bitmap.value(bitmap.frame(0), x, y, 0);

      if (value <= 0) {
        return [0, 0];
      }

      let place: number;

      switch (settings.textColors) {
        case 'letters': {
          let letter = 0;

          for (const start of bitmap.letterStarts) {
            if (start <= x) {
              letter++;
            }
          }

          place = letter * 0.17;
          break;
        }
        case 'one':
          place = 0;
          break;
        default:
          place = x / bitmap.width;
      }

      return [place, value / 255];
    }
    case 'image': {
      // an image or an animation, fitted into the picture
      const bitmap = settings.bitmap;

      if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) {
        return [0, 0];
      }

      const [u, v] = imagePosition(settings, cycle, context, bitmap);

      if (u < 0 || u >= 1 || v < 0 || v >= 1) {
        return [0, 0];
      }

      const frame = bitmap.frame(bitmap.frameAt(fract(cycle)));
      const x = Math.min(Math.floor(u * bitmap.width), bitmap.width - 1);
      const y = Math.min(Math.floor(v * bitmap.height), bitmap.height - 1);
      const red = bitmap.value(frame, x, y, 0);
      const green = bitmap.channels === 3 ? bitmap.value(frame, x, y, 1) : red;
      const blue = bitmap.channels === 3 ? bitmap.value(frame, x, y, 2) : red;

      if (settings.imageColors === 'palette') {
        // how bright it is, through the palette
        return [(red * 299 + green * 587 + blue * 114) / 255000, 1];
      }

      return [0, 1, red / 255, green / 255, blue / 255];
    }
    default:
      // a pattern of a newer designer
      return [0, 0];
  }
}
