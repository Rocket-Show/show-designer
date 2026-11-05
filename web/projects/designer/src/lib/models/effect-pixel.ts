import { EffectCurve } from './effect-curve';
import { PixelPalette } from './pixel-palette';
import { PixelPatternSettings } from './pixel-pattern';

// A pixel effect: a pattern painted over the pixels of the bars and matrices of a preset (and fixtures without pixels,
// each of them one pixel), in the colors of a palette. Each pixel takes the color of the pattern where it is in its
// fixture. It runs on the timing of a curve: its period, its phase, the chase from one fixture to the next (a fixture
// with all its pixels takes one step) and how long it runs. Rocket Show plays it the very same way (EffectPixel).
export class EffectPixel extends EffectCurve implements PixelPatternSettings {
  // see pixel-pattern
  pattern = 'chase';
  size = 0.25;
  softness = 0.3;
  direction = 'right';
  shape = 'circle';
  bounce = false;

  // where the random looking patterns start from, so two effects with the same pattern can look different
  seed = 1;

  // the pattern runs out from the middle of each fixture to both of its ends, mirrored
  mirror = false;

  // the shades of the color the preset puts on each pixel, unless a palette of its own is picked
  palette = new PixelPalette({ ref: 'preset' });

  // 'fixture' paints the pattern over each fixture on its own, 'stage' spreads one picture over all of them, as they
  // hang on the stage: seen from the 'front' or from above ('top', e.g. for fixtures lying on the floor), framed around
  // the pixels of the preset (see pixel-stage)
  spread = 'fixture';
  view = 'front';

  // a pixel with a white LED lights the white part of the color (the least of red, green and blue) with it, the rest
  // with red, green and blue
  whiteLed = false;

  // what it does with the color the preset puts on a pixel: 'replace' it, 'mask' it (the pattern only sets how bright
  // it is), 'add' to it or take the 'max' of both on each of red, green and blue
  blend = 'replace';

  constructor(data?: any) {
    super(data, 'pixel');

    if (!data) {
      return;
    }

    // a value missing or null keeps the default, like in Rocket Show
    this.pattern = data.pattern || 'chase';
    this.size = data.size ?? 0.25;
    this.softness = data.softness ?? 0.3;
    this.direction = data.direction || 'right';
    this.shape = data.shape || 'circle';
    this.bounce = data.bounce === true;
    this.seed = data.seed ?? 1;
    this.mirror = data.mirror === true;
    this.palette = data.palette ? new PixelPalette(data.palette) : new PixelPalette({ ref: 'preset' });
    this.spread = data.spread || 'fixture';
    this.view = data.view || 'front';
    this.whiteLed = data.whiteLed === true;
    this.blend = data.blend || 'replace';
  }
}
