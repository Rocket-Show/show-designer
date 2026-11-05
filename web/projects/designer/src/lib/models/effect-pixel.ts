import { EffectCurve } from './effect-curve';
import { PixelAudioSettings } from './pixel-audio';
import { PixelBitmap } from './pixel-bitmap';
import { PixelPalette } from './pixel-palette';
import { PixelPatternSettings } from './pixel-pattern';

// A pixel effect: a pattern painted over the pixels of the bars and matrices of a preset (and fixtures without pixels,
// each of them one pixel), in the colors of a palette. Each pixel takes the color of the pattern where it is in its
// fixture. It runs on the timing of a curve: its period, its phase, the chase from one fixture to the next (a fixture
// with all its pixels takes one step) and how long it runs. Rocket Show plays it the very same way (EffectPixel).
export class EffectPixel extends EffectCurve implements PixelPatternSettings, PixelAudioSettings {
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

  // The picture of a text or an image and how it is shown (see PixelPatternSettings). The designer makes the picture
  // of a text from the text and its font, and the one of an image when it is picked: Rocket Show only reads the
  // picture.
  bitmap: PixelBitmap;
  scroll = 'auto';
  align = 'center';
  offsetY = 0;
  fit = 'contain';
  textColors = 'along';
  imageColors = 'own';

  // The audio it follows: none ('off') or the one of the composition playing, and how (see PixelAudio). The level meter
  // and the wave of the audio show it, any other pattern follows it with its brightness or with its size.
  audioSource = 'off';
  audioBand = 'full';
  audioGainDb = 0;
  audioFloorDb = -60;
  audioAttackMillis = 20;
  audioReleaseMillis = 300;
  audioFollows = 'brightness';
  // the audio buses of Rocket Show it follows, added together, by their uuids: all of them, if none are named
  audioBuses: string[] = [];

  // the text and its font (one of the pixel fonts, e.g. 'pixel-5x7', or of the browser) and how high it is drawn in
  // pixels with a font of the browser, the name of the image. Only the designer reads them.
  text = '';
  font = 'pixel-5x7';
  textHeight = 8;
  imageName = '';

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
    this.bitmap = data.bitmap ? new PixelBitmap(data.bitmap) : undefined;
    this.scroll = data.scroll || 'auto';
    this.align = data.align || 'center';
    this.offsetY = data.offsetY ?? 0;
    this.fit = data.fit || 'contain';
    this.textColors = data.textColors || 'along';
    this.imageColors = data.imageColors || 'own';
    this.audioSource = data.audioSource || 'off';
    this.audioBand = data.audioBand || 'full';
    this.audioGainDb = data.audioGainDb ?? 0;
    this.audioFloorDb = data.audioFloorDb ?? -60;
    this.audioAttackMillis = data.audioAttackMillis ?? 20;
    this.audioReleaseMillis = data.audioReleaseMillis ?? 300;
    this.audioFollows = data.audioFollows || 'brightness';
    this.audioBuses = Array.isArray(data.audioBuses) ? data.audioBuses.filter((bus: any) => typeof bus === 'string') : [];
    this.text = data.text ?? '';
    this.font = data.font || 'pixel-5x7';
    this.textHeight = data.textHeight ?? 8;
    this.imageName = data.imageName ?? '';
    this.blend = data.blend || 'replace';
  }
}
