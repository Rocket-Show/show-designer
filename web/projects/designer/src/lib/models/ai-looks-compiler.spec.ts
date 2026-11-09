import { AiLooks, AiPreset, AiRig } from './ai-looks';
import {
  AiCompileContext,
  aiColorToRgb,
  aiRotationPercentage,
  compileAiLooks,
  genericStrobePercentage,
  genericStrobeValues,
} from './ai-looks-compiler';
import { EffectCurve } from './effect-curve';
import { EffectPixel } from './effect-pixel';
import { FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { Preset } from './preset';

// The looks the AI answers, turned into presets and scenes of the designer, without a project around them: what the
// AiLooksService spec doesn't play through the preview.
describe('compileAiLooks', () => {
  const nothing: Omit<AiPreset, 'id' | 'name' | 'groups'> = {
    order: 'rig',
    wings: false,
    dimmer: null,
    dimmerFan: null,
    color: null,
    colorGradient: null,
    colorSequence: null,
    zoom: null,
    zoomFan: null,
    position: null,
    movement: null,
    dimmerEffect: null,
    pixel: null,
    gobo: null,
    prism: null,
    strobe: null,
  };

  const rig: AiRig = {
    groups: [
      {
        group: { id: 'pars', name: 'Pars', category: '', count: 2, position: 'top-front', abilities: ['dimmer', 'color'] },
        fixtureUuids: ['par-1', 'par-2'],
      },
    ],
  };

  function context(data: Partial<AiCompileContext> = {}): AiCompileContext {
    let uuid = 0;

    return {
      stageWidthCm: 600,
      stageDepthCm: 600,
      stageFloorHeightCm: 30,
      presetFixtures: [{ fixtureUuid: 'par-1' }, { fixtureUuid: 'par-2' }, { fixtureUuid: 'other' }] as any[],
      rig,
      bpm: 120,
      newUuid: () => 'uuid-' + ++uuid,
      ...data,
    };
  }

  function compileOne(preset: Partial<AiPreset>, data: Partial<AiCompileContext> = {}): Preset {
    const looks: AiLooks = {
      name: '',
      summary: '',
      presets: [{ ...nothing, id: 'look', name: '', groups: ['pars'], ...preset }],
      scenes: [],
    };

    return compileAiLooks(looks, context(data)).presets[0];
  }

  function value(preset: Preset, type: FixtureCapabilityType, color?: string): FixtureCapabilityValue {
    return preset.steps[0].fixtureCapabilityValues.find((candidate) => candidate.type === type && (!color || candidate.color === color));
  }

  it('reads colors as #rrggbb only', () => {
    expect(aiColorToRgb('#ff8000')).toEqual([1, 0.502, 0]);
    expect(aiColorToRgb('red')).toBeUndefined();
    expect(aiColorToRgb(undefined)).toBeUndefined();
  });

  it('names a preset after its id when it has no name, playing the fixtures of its groups only', () => {
    const preset = compileOne({ dimmer: 0.5 });

    expect(preset.name).toBe('look');
    expect(preset.fixtures.map((fixture) => fixture.fixtureUuid)).toEqual(['par-1', 'par-2']);
    expect(preset.fanOrder).toBe('preset');
    expect(preset.patternWings).toBe(1);
    expect(preset.emittersFromColor).toBe(true);
    expect(value(preset, FixtureCapabilityType.Intensity).valuePercentage).toBe(0.5);
  });

  it('spreads a gradient of a single valid color as that color, and of none not at all', () => {
    const single = compileOne({ dimmer: 1, colorGradient: { colors: ['#00ff00', 'green'], blend: 'smooth' } });
    expect(value(single, FixtureCapabilityType.ColorIntensity, 'Green').valuePercentage).toBe(1);
    expect(value(single, FixtureCapabilityType.ColorIntensity, 'Green').fan).toBeUndefined();

    const none = compileOne({ dimmer: 1, colorGradient: { colors: ['red', 'blue'], blend: 'smooth' } });
    expect(value(none, FixtureCapabilityType.ColorIntensity)).toBeUndefined();

    // a color with a sequence is left to the steps
    const sequenced = compileOne({
      dimmer: 1,
      color: '#ff0000',
      colorSequence: { colors: ['#00ff00', '#0000ff'], beatsPerColor: 1, fade: 'smooth', chase: 'alternate' },
    });
    expect(sequenced.steps.length).toBe(2);
    expect(sequenced.steps[0].fixtureCapabilityValues.find((candidate) => candidate.color === 'Red').valuePercentage).toBe(0);
    expect(sequenced.steps.map((step) => step.transitionMillis)).toEqual([undefined, undefined]);
    expect([sequenced.stepsPhasingMode, sequenced.stepsPhasingMillis]).toEqual(['millis', 500]);
  });

  it('zooms the beams, and points the heads at the spots of the stage', () => {
    const zoomed = compileOne({ dimmer: 1, zoom: 0.3 });
    expect(value(zoomed, FixtureCapabilityType.Zoom).valuePercentage).toBe(0.3);
    expect(value(zoomed, FixtureCapabilityType.Zoom).fan).toBeUndefined();

    const spots = {
      center: [0, 30, 0],
      front: [0, 30, 200],
      back: [0, 30, -200],
      left: [-150, 30, 0],
      right: [150, 30, 0],
    };
    for (const aim of Object.keys(spots)) {
      const pan = value(
        compileOne({ dimmer: 1, position: { aim: aim as any, fanDegrees: 0, fanShape: 'linear' } }),
        FixtureCapabilityType.Pan
      );
      expect([pan.aimX, pan.aimY, pan.aimZ]).toEqual(spots[aim]);
      expect(pan.spreadDegrees).toBeUndefined();
    }

    const fanned = value(
      compileOne({ dimmer: 1, position: { aim: 'straight', fanDegrees: 40, fanShape: 'linear' } }),
      FixtureCapabilityType.Pan
    );
    expect([fanned.spreadDegrees, fanned.fanShape]).toEqual([40, undefined]);
  });

  it('runs the effects over the fixtures all together, in one pass or every other one', () => {
    const together = compileOne({ dimmerEffect: { curve: 'sine', beats: 2, depth: 1, width: 0.5, chase: 'none' } })
      .effects[0] as EffectCurve;
    expect(together.phasingMode).toBe('millis');
    expect(together.phasingMillis).toBe(0);
    expect(together.lengthMillis).toBe(1000);
    // the curve pulses the brightness of the scene, all of it at its top
    expect(together.position + together.amplitude / 2).toBe(1);
    expect(together.position - together.amplitude / 2).toBe(0);

    const fanned = compileOne({
      dimmerFan: { shape: 'linear', from: 0, to: 0.8 },
      dimmerEffect: { curve: 'triangle', beats: 1, depth: 0.5, width: 0.5, chase: 'spread' },
    }).effects[0] as EffectCurve;
    // the fan of the preset is the brightness it pulses, down to half of it
    expect(fanned.position + fanned.amplitude / 2).toBeCloseTo(1, 6);
    expect(fanned.position - fanned.amplitude / 2).toBeCloseTo(0.5, 6);
  });

  it('paints the pixels in the shades of the color of the preset, unless a palette of the designer or of its own is given', () => {
    const pixel = (palette: string, colors: string[] = []) =>
      (
        compileOne({ dimmer: 1, pixel: { pattern: 'chase', palette, colors, beats: 1, direction: 'right', size: 0.2 } })
          .effects[0] as EffectPixel
      ).palette;

    expect(pixel('preset').ref).toBe('preset');
    expect(pixel('unknown').ref).toBe('preset');
    expect(pixel('custom', ['#ff0000']).ref).toBe('preset');
    expect(pixel('fire').ref).toBe('fire');
    expect(pixel('custom', ['#ff0000', '#0000ff']).stops.length).toBe(2);
  });

  it('flashes a strobe from 1 to 20 times a second without the speeds of the models, at full', () => {
    const preset = compileOne({ strobe: { effect: 'Lightning', flashesPerSecond: 3 } });
    const strobe = value(preset, FixtureCapabilityType.ShutterStrobe);

    expect(strobe.valuePercentage).toBeCloseTo(2 / 19, 3);
    expect(strobe.shutterEffect).toBe('Lightning');
    expect(value(preset, FixtureCapabilityType.StrobeSpeed).valuePercentage).toBe(strobe.valuePercentage);
    expect(value(preset, FixtureCapabilityType.Intensity).valuePercentage).toBe(1);

    // a plain strobe, for a profile
    const [plain, speed] = genericStrobeValues('Strobe', 50, 'profile');
    expect([plain.valuePercentage, plain.shutterEffect, plain.profileUuid, speed.profileUuid]).toEqual([
      1,
      undefined,
      'profile',
      'profile',
    ]);
    // never so slow it doesn't flash at all
    expect(genericStrobePercentage(0)).toBe(0.01);
  });

  it('lights the fixtures of a preset no preset brightens at full, whatever it lights them with', () => {
    const lit: Partial<AiPreset>[] = [
      { colorGradient: { colors: ['#ff0000', '#0000ff'], blend: 'steps' } },
      { colorSequence: { colors: ['#ff0000', '#0000ff'], beatsPerColor: 1, fade: 'snap', chase: 'none' } },
      { pixel: { pattern: 'chase', palette: 'fire', colors: [], beats: 1, direction: 'right', size: 0.2 } },
      { zoomFan: { shape: 'center', from: 0, to: 1 } },
      { position: { aim: 'center', fanDegrees: 0, fanShape: 'linear' } },
      { movement: { shape: 'circle', panDegrees: 10, tiltDegrees: 10, beats: 4, chase: 'none', fan: undefined } },
    ];

    for (const preset of lit) {
      expect(value(compileOne(preset), FixtureCapabilityType.Intensity).valuePercentage).toBe(1);
    }

    // a color it can't read lights nothing, a movement without a fan moves all heads the same
    const unreadable = compileOne({ color: 'red' });
    expect(value(unreadable, FixtureCapabilityType.ColorIntensity)).toBeUndefined();
    expect(value(unreadable, FixtureCapabilityType.Intensity)).toBeUndefined();
    expect((compileOne(lit[5]).effects[0] as EffectCurve).fanMode).toBe('none');
  });

  it('puts the prism in, turning it as fast as asked, and leaves the gobos to the models', () => {
    const turning = compileOne({ prism: { rotation: -0.5 } });
    expect(value(turning, FixtureCapabilityType.Prism).valuePercentage).toBe(1);
    expect(value(turning, FixtureCapabilityType.PrismRotation).valuePercentage).toBe(0.25);
    // a prism or a gobo lights the fixtures, at full where nothing else brightens them
    expect(value(turning, FixtureCapabilityType.Intensity).valuePercentage).toBe(1);
    expect(value(compileOne({ prism: { rotation: 0 } }), FixtureCapabilityType.PrismRotation)).toBeUndefined();

    // the slots of the gobos of a kind come from the models (see AiLooksService), without them none
    const asked: any[] = [];
    const slot = new FixtureCapabilityValue({ type: FixtureCapabilityType.WheelSlot, wheel: 'Gobo Wheel', slotNumber: 3 });
    const goboValues = (...args: any[]) => {
      asked.push(args);
      return [slot];
    };
    expect(value(compileOne({ gobo: { pattern: 'star', rotation: 0.2 } }, { goboValues }), FixtureCapabilityType.WheelSlot)).toEqual(slot);
    expect(asked).toEqual([[['par-1', 'par-2'], 'star', 0.2]]);
    expect(value(compileOne({ gobo: { pattern: 'star', rotation: 0 } }), FixtureCapabilityType.WheelSlot)).toBeUndefined();

    expect([aiRotationPercentage(2), aiRotationPercentage(-1), aiRotationPercentage(undefined), aiRotationPercentage(0.3)]).toEqual([
      1, 0, 0.5, 0.65,
    ]);
  });

  it('makes scenes of the presets it made, named after their section without a name, and blackouts without presets', () => {
    const looks: AiLooks = {
      name: '',
      summary: '',
      presets: [{ ...nothing, id: 'wash', name: 'Wash', groups: ['pars'], dimmer: 1 }],
      scenes: [
        { name: '', section: 'verse', energy: 2, presets: ['wash'], fadeInBeats: undefined, fadeOutBeats: undefined },
        { name: 'Ghost', section: 'chorus', energy: 3, presets: ['missing'], fadeInBeats: 0, fadeOutBeats: 0 },
        { name: 'Dark', section: 'blackout', energy: 1, presets: [], fadeInBeats: 0, fadeOutBeats: 0 },
      ],
    };

    const { scenes } = compileAiLooks(looks, context());

    expect(scenes.map((scene) => [scene.name, scene.presetUuids.length, scene.fadeInMillis])).toEqual([
      ['verse', 1, 0],
      ['Dark', 0, 0],
    ]);
  });
});
