import { EffectCurve } from './effect-curve';
import { EffectPixel } from './effect-pixel';
import { Preset } from './preset';

describe('EffectPixel', () => {
  it('starts as a chase in the shades of the color of the preset, over each fixture on its own', () => {
    const effect = new EffectPixel();

    expect(effect.type).toBe('pixel');
    expect(effect.pattern).toBe('chase');
    expect(effect.palette.ref).toBe('preset');
    expect(effect.spread).toBe('fixture');
    expect(effect.view).toBe('front');
    expect(effect.whiteLed).toBe(false);
    expect([effect.bitmap, effect.scroll, effect.align, effect.offsetY, effect.fit, effect.textColors, effect.imageColors]).toEqual([
      undefined,
      'auto',
      'center',
      0,
      'contain',
      'along',
      'own',
    ]);
    expect([effect.text, effect.font, effect.textHeight]).toEqual(['', 'pixel-5x7', 8]);
    expect(effect.blend).toBe('replace');
    expect(effect.seed).toBe(1);
  });

  it('keeps the default of a value which is missing or null, like Rocket Show', () => {
    const effect = new EffectPixel({
      type: 'pixel',
      pattern: null,
      size: null,
      softness: null,
      direction: null,
      seed: null,
      palette: null,
      spread: null,
      view: null,
      whiteLed: null,
      blend: null,
    });

    expect([effect.pattern, effect.size, effect.softness, effect.direction, effect.seed]).toEqual(['chase', 0.25, 0.3, 'right', 1]);
    expect([effect.palette.ref, effect.spread, effect.view, effect.blend, effect.bounce, effect.mirror, effect.whiteLed]).toEqual([
      'preset',
      'fixture',
      'front',
      'replace',
      false,
      false,
      false,
    ]);
  });

  it('reads what it was saved with, and runs on the timing of a curve', () => {
    const effect = new EffectPixel({
      type: 'pixel',
      uuid: 'sparkles',
      pattern: 'sparkle',
      size: 0.6,
      bounce: true,
      mirror: true,
      seed: 7,
      lengthMode: 'beats',
      lengthBeats: 2,
      palette: { stops: [{ position: 0.5, color: '#00ff00' }], between: 'steps', repeat: 'wrap', ref: 'forest' },
      blend: 'mask',
    });

    expect([effect.uuid, effect.pattern, effect.size, effect.bounce, effect.mirror, effect.seed, effect.blend]).toEqual([
      'sparkles',
      'sparkle',
      0.6,
      true,
      true,
      7,
      'mask',
    ]);
    expect(effect.palette.stops[0].color).toBe('#00ff00');
    expect([effect.palette.between, effect.palette.repeat, effect.palette.ref]).toEqual(['steps', 'wrap', 'forest']);
    expect(effect.getLengthMillis(120)).toBe(1000);
  });

  it('is one of the effects a preset keeps', () => {
    const preset = new Preset({ effects: [{ type: 'pixel', uuid: 'pixel', pattern: 'fire' }, { type: 'sparkles' }] });

    expect(preset.effects.length).toBe(1);
    expect(preset.effects[0] instanceof EffectPixel).toBe(true);
    expect((preset.effects[0] as EffectPixel).pattern).toBe('fire');
  });
});

describe('EffectCurve cycles', () => {
  function curve(settings: any = {}): EffectCurve {
    return new EffectCurve({ lengthMillis: 1000, ...settings });
  }

  it('counts the periods it has run through, with the part of the one it is in', () => {
    expect(curve().getCyclesAtMillis(2500)).toBe(2.5);
    expect(curve().getCyclesAtMillis(-250)).toBe(-0.25);
    // the phase moves its start, the chase delays each fixture
    expect(curve({ phaseMillis: 500 }).getCyclesAtMillis(2500)).toBe(2);
    expect(curve({ phasingMillis: 250 }).getCyclesAtMillis(2500, 2, 3)).toBe(2);
  });

  it('does not apply before a fixture starts its run, nor after it, if it leaves the fixture to the preset then', () => {
    const run = curve({ runMode: 'cycles', runCycles: 2, phasingMillis: 500 });

    expect(run.getCyclesAtMillis(400, 1, 2)).toBeUndefined();
    expect(run.getCyclesAtMillis(1500, 1, 2)).toBe(1);
    expect(curve({ runMode: 'cycles', runCycles: 2, endMode: 'base' }).getCyclesAtMillis(3000)).toBeUndefined();
  });

  it('holds what it showed just before the end of its run, also on the border of a period', () => {
    expect(curve({ runMode: 'cycles', runCycles: 2 }).getCyclesAtMillis(5000)).toBe(2 - 1e-9);
    expect(curve({ runMode: 'duration', runDurationMillis: 1500 }).getCyclesAtMillis(5000)).toBe(1.5);
    // the cycles agree with the position inside the cycle
    expect(curve({ runMode: 'cycles', runCycles: 2 }).getCyclePositionAtMillis(5000)).toBe(1 - 1e-9);
  });
});
