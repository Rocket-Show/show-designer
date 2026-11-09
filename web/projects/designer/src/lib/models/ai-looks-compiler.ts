import { AiChase, AiFan, AiLooks, AiPreset, AiRig, AiScene } from './ai-looks';
import { EffectCurve } from './effect-curve';
import { EffectPanTilt } from './effect-pan-tilt';
import { EffectPixel } from './effect-pixel';
import { FanStop, getFanMiddleValue, getFanStops } from './fan';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { PixelPalette, PixelPaletteStop } from './pixel-palette';
import { builtInPixelPalettes, pixelPaletteOf } from './pixel-palettes';
import { Preset } from './preset';
import { PresetFixture } from './preset-fixture';
import { layoutSteps, PresetStep } from './preset-step';
import { Scene } from './scene';

// What the looks are turned into presets and scenes for: the project (its stage and the order of its fixtures), the
// rig the looks were designed for, the tempo they follow and where the new uuids come from. The strobe of each model of
// the fixtures flashes as fast as the looks say with the values strobeValues gives, and its gobo wheel shows a gobo of
// the kind asked for with the ones goboValues gives (see AiLooksService).
export interface AiCompileContext {
  stageWidthCm: number;
  stageDepthCm: number;
  stageFloorHeightCm: number;
  presetFixtures: PresetFixture[];
  rig: AiRig;
  bpm: number;
  newUuid: () => string;
  strobeValues?: (fixtureUuids: string[], effect: string, flashesPerSecond: number) => FixtureCapabilityValue[];
  goboValues?: (fixtureUuids: string[], pattern: string, rotation: number) => FixtureCapabilityValue[];
}

export interface AiCompiled {
  presets: Preset[];
  scenes: Scene[];

  // the scene of the looks each scene is made of, in the same order (a scene of the looks without a preset left out)
  sources?: AiScene[];
}

// how long a number of beats lasts at the tempo of the looks
function beatsMillis(beats: number, bpm: number): number {
  return Math.round((beats * 60000) / bpm);
}

// a color as #rrggbb in red, green and blue from 0 to 1
export function aiColorToRgb(hex: string): number[] {
  const value = /^#([0-9a-f]{6})$/i.exec(hex || '');

  if (!value) {
    return undefined;
  }

  const number = parseInt(value[1], 16);

  return [(number >> 16) & 255, (number >> 8) & 255, number & 255].map((component) => Math.round((component / 255) * 1000) / 1000);
}

const rgbColors = [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue];

function capabilityValue(data: any): FixtureCapabilityValue {
  return new FixtureCapabilityValue(data);
}

// a value of a percentage, or the same fanned out over the fixtures (saved with the value of the one in the middle)
function fannedValue(type: FixtureCapabilityType, value: number, fan: AiFan): FixtureCapabilityValue {
  if (fan) {
    const stops = getFanStops(fan.shape, fan.from, fan.to);

    return capabilityValue({ type, valuePercentage: getFanMiddleValue(stops), fan: stops });
  }

  return typeof value === 'number' ? capabilityValue({ type, valuePercentage: value }) : undefined;
}

function colorValues(hex: string): FixtureCapabilityValue[] {
  const rgb = aiColorToRgb(hex);

  return rgb
    ? rgbColors.map((color, index) => capabilityValue({ type: FixtureCapabilityType.ColorIntensity, color, valuePercentage: rgb[index] }))
    : [];
}

// Colors spread over the fixtures: red, green and blue fanned with stops at the same places, blended or in steps
function gradientValues(colors: string[], blend: string): FixtureCapabilityValue[] {
  const rgbs = colors.map(aiColorToRgb).filter((rgb) => !!rgb);

  if (rgbs.length < 2) {
    return rgbs.length === 1 ? colorValues(colors[0]) : [];
  }

  return rgbColors.map((color, index) => {
    const fan = rgbs.map(
      (rgb, stop) => new FanStop({ position: Math.round((stop / (rgbs.length - 1)) * 1000) / 1000, valuePercentage: rgb[index] })
    );
    const value = capabilityValue({ type: FixtureCapabilityType.ColorIntensity, color, valuePercentage: getFanMiddleValue(fan), fan });

    if (blend === 'steps') {
      value.fanBetween = 'steps';
    }

    return value;
  });
}

// Where the moving heads point: at a spot on the floor of the stage (left and right as the audience sees it, the
// audience being at the front, towards z), or straight out of their base. Fanned out from the first head or the middle.
function positionValues(position: AiPreset['position'], context: AiCompileContext): FixtureCapabilityValue[] {
  const floor = context.stageFloorHeightCm;
  const spots: { [aim: string]: number[] } = {
    center: [0, floor, 0],
    front: [0, floor, context.stageDepthCm / 2 - 100],
    back: [0, floor, -context.stageDepthCm / 2 + 100],
    left: [-context.stageWidthCm / 4, floor, 0],
    right: [context.stageWidthCm / 4, floor, 0],
  };
  const spot = spots[position.aim];
  const pan = capabilityValue({ type: FixtureCapabilityType.Pan, valueDegrees: 0 });
  const tilt = capabilityValue({ type: FixtureCapabilityType.Tilt, valueDegrees: 0 });

  if (spot) {
    for (const value of [pan, tilt]) {
      [value.aimX, value.aimY, value.aimZ] = spot;
    }
  }

  if (position.fanDegrees > 0) {
    pan.spreadDegrees = position.fanDegrees;

    if (position.fanShape === 'center') {
      pan.fanShape = 'center';
    }
  }

  return [pan, tilt];
}

// Lets an effect run over the fixtures in their order: all together, one pass from the first to the last one, or every
// other fixture half a period apart
function chaseEffect(effect: EffectCurve, chase: AiChase) {
  if (chase === 'spread') {
    effect.phasingMode = 'spread';
    effect.phasingCycles = 1;
  } else if (chase === 'alternate') {
    effect.phasingMode = 'beats';
    effect.phasingBeats = effect.lengthBeats / 2;
  }
}

function onTheBeat(effect: EffectCurve, beats: number, context: AiCompileContext) {
  effect.uuid = context.newUuid();
  effect.lengthMode = 'beats';
  effect.lengthBeats = beats;
  effect.lengthMillis = beatsMillis(beats, context.bpm);
}

// the brightness pulsing from the brightness of the preset down by the depth, over the part of the period it's on
function dimmerCurve(ai: AiPreset, context: AiCompileContext): EffectCurve {
  const effect = new EffectCurve();
  const top =
    typeof ai.dimmer === 'number'
      ? ai.dimmer
      : ai.dimmerFan
      ? getFanMiddleValue(getFanStops(ai.dimmerFan.shape, ai.dimmerFan.from, ai.dimmerFan.to))
      : 1;
  const bottom = top * (1 - ai.dimmerEffect.depth);

  onTheBeat(effect, ai.dimmerEffect.beats, context);
  effect.curveType = ai.dimmerEffect.curve;
  effect.capabilities = [new FixtureCapability({ type: FixtureCapabilityType.Intensity })];
  effect.amplitude = top - bottom;
  effect.position = (top + bottom) / 2;
  effect.dutyCycle = ai.dimmerEffect.width;
  chaseEffect(effect, ai.dimmerEffect.chase);

  return effect;
}

function movementEffect(ai: AiPreset, context: AiCompileContext): EffectPanTilt {
  const effect = new EffectPanTilt();

  onTheBeat(effect, ai.movement.beats, context);
  effect.shape = ai.movement.shape;
  effect.sizePanDegrees = ai.movement.panDegrees;
  effect.sizeTiltDegrees = ai.movement.tiltDegrees;
  effect.fanMode = ai.movement.fan || 'none';
  chaseEffect(effect, ai.movement.chase);

  return effect;
}

function pixelEffect(ai: AiPreset, context: AiCompileContext): EffectPixel {
  const effect = new EffectPixel();
  const pixel = ai.pixel;

  onTheBeat(effect, pixel.beats, context);
  effect.pattern = pixel.pattern;
  effect.direction = pixel.direction;
  effect.size = pixel.size;

  const builtIn = builtInPixelPalettes.find((palette) => palette.id === pixel.palette && palette.id !== 'preset');

  if (pixel.palette === 'custom' && pixel.colors.length >= 2) {
    effect.palette = new PixelPalette({
      stops: pixel.colors.map((color, index) => new PixelPaletteStop({ position: index / (pixel.colors.length - 1), color })),
    });
  } else if (builtIn) {
    effect.palette = pixelPaletteOf(builtIn);
  } else {
    effect.palette = new PixelPalette({ ref: 'preset' });
  }

  return effect;
}

// the speed of a rotation from -1 (fastest anticlockwise) to 1 as the designer keeps it: from 0 to 1, standing in the
// middle (see capability-position)
export function aiRotationPercentage(rotation: number): number {
  return Math.round((0.5 + Math.min(Math.max(rotation || 0, -1), 1) / 2) * 1000) / 1000;
}

// the prism in the beams, turning if it does
function prismValues(prism: AiPreset['prism']): FixtureCapabilityValue[] {
  const values = [capabilityValue({ type: FixtureCapabilityType.Prism, valuePercentage: 1 })];

  if (prism.rotation) {
    values.push(capabilityValue({ type: FixtureCapabilityType.PrismRotation, valuePercentage: aiRotationPercentage(prism.rotation) }));
  }

  return values;
}

// does the preset light its fixtures in some way, besides their brightness?
function lights(ai: AiPreset): boolean {
  return !!(
    !!aiColorToRgb(ai.color) ||
    ai.colorGradient ||
    ai.colorSequence ||
    ai.pixel ||
    typeof ai.zoom === 'number' ||
    ai.zoomFan ||
    ai.position ||
    ai.movement ||
    ai.gobo ||
    ai.prism
  );
}

function setsBrightness(ai: AiPreset): boolean {
  return typeof ai.dimmer === 'number' || !!ai.dimmerFan || !!ai.dimmerEffect || !!ai.strobe;
}

// The presets and scenes of the looks, in terms of the designer: a preset for each preset of the looks, playing the
// fixtures of its groups in the order of the fixture pool, with a step for each color of a sequence (or a single one),
// timed in beats, and its effects; a scene for each scene of the looks, layering its presets.
export function compileAiLooks(looks: AiLooks, context: AiCompileContext): AiCompiled {
  const groups = new Map(context.rig.groups.map((group) => [group.group.id, group.fixtureUuids]));

  // the groups some preset brightens: a preset lighting a group no preset brightens lights it at full, or it stays
  // dark where its fixtures have a dimmer
  const brightened = new Set<string>();
  for (const ai of looks.presets) {
    if (setsBrightness(ai)) {
      ai.groups.forEach((group) => brightened.add(group));
    }
  }

  const presets = new Map<string, Preset>();

  for (const ai of looks.presets) {
    const fixtureUuids = new Set(([] as string[]).concat(...ai.groups.map((group) => groups.get(group) || [])));

    if (fixtureUuids.size === 0) {
      continue;
    }

    const preset = new Preset();
    preset.uuid = context.newUuid();
    preset.name = ai.name || ai.id;
    preset.emittersFromColor = true;
    preset.fixtures = context.presetFixtures
      .filter((presetFixture) => fixtureUuids.has(presetFixture.fixtureUuid))
      .map((presetFixture) => new PresetFixture({ fixtureUuid: presetFixture.fixtureUuid, pixelKey: presetFixture.pixelKey }));
    preset.fanOrder = ai.order && ai.order !== 'rig' ? ai.order : 'preset';
    preset.patternWings = ai.wings ? 2 : 1;

    // what every step of the preset sets
    const values: FixtureCapabilityValue[] = [];
    const add = (...added: FixtureCapabilityValue[]) => values.push(...added.filter((value) => !!value));

    // a strobe flashes at full, and a preset lighting groups no preset brightens lights them at full
    let dimmer = ai.dimmer;
    if (typeof dimmer !== 'number' && !ai.dimmerFan && !ai.dimmerEffect) {
      if (ai.strobe || (lights(ai) && !ai.groups.some((group) => brightened.has(group)))) {
        dimmer = 1;
      }
    }

    add(fannedValue(FixtureCapabilityType.Intensity, dimmer, ai.dimmerFan));

    if (ai.colorGradient) {
      add(...gradientValues(ai.colorGradient.colors, ai.colorGradient.blend));
    } else if (ai.color && !ai.colorSequence) {
      add(...colorValues(ai.color));
    }

    add(fannedValue(FixtureCapabilityType.Zoom, ai.zoom, ai.zoomFan));

    if (ai.position) {
      add(...positionValues(ai.position, context));
    }

    if (ai.gobo && context.goboValues) {
      add(...context.goboValues(Array.from(fixtureUuids), ai.gobo.pattern, ai.gobo.rotation));
    }

    if (ai.prism) {
      add(...prismValues(ai.prism));
    }

    if (ai.strobe) {
      add(
        ...(context.strobeValues
          ? context.strobeValues(Array.from(fixtureUuids), ai.strobe.effect, ai.strobe.flashesPerSecond)
          : genericStrobeValues(ai.strobe.effect, ai.strobe.flashesPerSecond))
      );
    }

    // a step for each color of a sequence, following the beat, or a single one
    const sequence = ai.colorSequence;
    const stepColors = sequence ? sequence.colors : [undefined];

    preset.steps = stepColors.map((color) => {
      const step = new PresetStep();
      step.uuid = context.newUuid();
      step.fixtureCapabilityValues = values.map((value) => new FixtureCapabilityValue(JSON.parse(JSON.stringify(value))));

      if (color) {
        step.fixtureCapabilityValues.push(...colorValues(color));
        step.transitionMillis = sequence.fade === 'smooth' ? undefined : 0;
      }

      return step;
    });

    if (sequence) {
      preset.stepsLengthMode = 'beats';
      preset.stepsBeatsPerMinute = context.bpm;
      preset.stepsLengthMillis = beatsMillis(sequence.beatsPerColor, context.bpm);
      preset.stepsLoop = true;

      if (sequence.chase === 'spread') {
        preset.stepsPhasingMode = 'spread';
        preset.stepsPhasingCycles = 1;
      } else if (sequence.chase === 'alternate') {
        preset.stepsPhasingMode = 'millis';
        preset.stepsPhasingMillis = preset.stepsLengthMillis;
      }

      layoutSteps(preset.steps, preset.stepsLengthMillis);
    }

    if (ai.dimmerEffect) {
      preset.effects.push(dimmerCurve(ai, context));
    }
    if (ai.movement) {
      preset.effects.push(movementEffect(ai, context));
    }
    if (ai.pixel) {
      preset.effects.push(pixelEffect(ai, context));
    }

    presets.set(ai.id, preset);
  }

  const scenes: Scene[] = [];
  const sources: AiScene[] = [];

  for (const ai of looks.scenes) {
    const scenePresets = ai.presets.map((id) => presets.get(id)).filter((preset) => !!preset);

    if (scenePresets.length === 0 && ai.section !== 'blackout') {
      continue;
    }

    const scene = new Scene();
    scene.uuid = context.newUuid();
    scene.name = ai.name || ai.section;
    scene.presetUuids = scenePresets.map((preset) => preset.uuid);
    scene.fadeInMillis = beatsMillis(ai.fadeInBeats || 0, context.bpm);
    scene.fadeOutMillis = beatsMillis(ai.fadeOutBeats || 0, context.bpm);
    scenes.push(scene);
    sources.push(ai);
  }

  return { presets: Array.from(presets.values()), scenes, sources };
}

// the strobe of a fixture not telling how fast it flashes: the fixture library calls a strobe 1 flash a second slow
// and 20 fast (see shutter)
const slowFlashesPerSecond = 1;
const fastFlashesPerSecond = 20;

export function genericStrobePercentage(flashesPerSecond: number): number {
  const percentage = (flashesPerSecond - slowFlashesPerSecond) / (fastFlashesPerSecond - slowFlashesPerSecond);

  return Math.round(Math.min(Math.max(percentage, 0.01), 1) * 1000) / 1000;
}

// the strobe in an effect, as fast as a fixture flashing from 1 to 20 times a second would flash
export function genericStrobeValues(effect: string, flashesPerSecond: number, profileUuid?: string): FixtureCapabilityValue[] {
  const percentage = genericStrobePercentage(flashesPerSecond);
  const strobe = capabilityValue({ type: FixtureCapabilityType.ShutterStrobe, valuePercentage: percentage, profileUuid });

  if (effect && effect !== 'Strobe') {
    strobe.shutterEffect = effect;
  }

  return [strobe, capabilityValue({ type: FixtureCapabilityType.StrobeSpeed, valuePercentage: percentage, profileUuid })];
}
