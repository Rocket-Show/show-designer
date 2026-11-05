import { Color } from '../models/color';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { Scene } from '../models/scene';
import { ColorService } from './color.service';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';

describe('ColorService', () => {
  let service: ColorService;

  // the parts of the two services the colors are built from. The real ones reach the
  // project and the server, which a color does not need.
  const fixtureService = {
    hexToRgb: (hex: string) => new Color(parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)),
    rgbToHex: (red: number, green: number, blue: number) =>
      '#' + [red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join(''),
    mixColors: (colors: Color[]) => colors[0],
    getProfileByUuid: () => undefined as any,
    getWheelByName: () => undefined as any,
    getMixedWheelSlotColor: () => undefined as any,
    capabilitiesMatch: (
      typeA: FixtureCapabilityType,
      typeB: FixtureCapabilityType,
      colorA: FixtureCapabilityColor,
      colorB: FixtureCapabilityColor
    ) => typeA === typeB && colorA === colorB,
  } as unknown as FixtureService;

  const presetService = {
    getCapabilityValueOf: (values: FixtureCapabilityValue[], type: FixtureCapabilityType, color: FixtureCapabilityColor) =>
      values.find((value) => value.type === type && value.color === color),
  } as unknown as PresetService;

  // a step which sets the passed color intensities
  function step(red: number, green: number, blue: number): PresetStep {
    const presetStep = new PresetStep();

    presetStep.fixtureCapabilityValues = [
      [FixtureCapabilityColor.Red, red],
      [FixtureCapabilityColor.Green, green],
      [FixtureCapabilityColor.Blue, blue],
    ].map(([color, value]: [FixtureCapabilityColor, number]) => {
      const capabilityValue = new FixtureCapabilityValue();
      capabilityValue.type = FixtureCapabilityType.ColorIntensity;
      capabilityValue.color = color;
      capabilityValue.valuePercentage = value;
      return capabilityValue;
    });

    return presetStep;
  }

  beforeEach(() => {
    service = new ColorService(fixtureService, presetService);
  });

  it('takes the color of a preset from its first step', () => {
    const preset = new Preset();
    preset.steps = [step(1, 0, 0), step(0, 0, 1)];

    expect(service.getDerivedPresetColor(preset)).toBe('#ff0000');
  });

  it('keeps that color while a later step is being edited', () => {
    const preset = new Preset();
    preset.steps = [step(1, 0, 0), step(0, 0, 1)];

    const before = service.getDerivedPresetColor(preset);
    preset.steps[1] = step(0, 1, 0);

    expect(service.getDerivedPresetColor(preset)).toBe(before);
  });

  // the values a preset carries on itself are only written when the project is saved,
  // so a color which followed them would stay a save behind
  it('follows the first step instead of the values written for the old players', () => {
    const preset = new Preset();
    preset.steps = [step(0, 0, 1)];
    preset.fixtureCapabilityValues = step(1, 0, 0).fixtureCapabilityValues;

    expect(service.getDerivedPresetColor(preset)).toBe('#0000ff');
  });

  it('reads a preset without steps from the values on the preset', () => {
    const preset = new Preset();
    preset.steps = [];
    preset.fixtureCapabilityValues = step(1, 0, 0).fixtureCapabilityValues;

    expect(service.getDerivedPresetColor(preset)).toBe('#ff0000');
  });

  it('leaves a preset which sets no color at all unmarked', () => {
    const preset = new Preset();
    preset.steps = [new PresetStep()];

    expect(service.getDerivedPresetColor(preset)).toBeUndefined();
  });

  function preset(uuid: string, presetStep: PresetStep, color?: string): Preset {
    const result = new Preset();
    result.uuid = uuid;
    result.steps = [presetStep];
    result.color = color;
    return result;
  }

  it('marks a preset with the color it puts out, or the one picked for it', () => {
    const red = preset('red', step(1, 0, 0), '#123456');
    const dark = preset('dark', new PresetStep(), '#654321');

    expect(service.getPresetColor(red)).toBe('#ff0000');
    expect(service.getPresetColor(dark)).toBe('#654321');

    red.colorAuto = false;
    expect(service.getPresetColor(red)).toBe('#123456');
  });

  it('shows a dark color bright enough to be seen, keeping its hue', () => {
    expect(service.getDerivedPresetColor(preset('dim', step(0.2, 0.1, 0)))).toBe('#964b00');
    // a preset fading its fixtures to black marks nothing
    expect(service.getDerivedPresetColor(preset('black', step(0, 0, 0)))).toBeUndefined();
  });

  it('takes the color of the wheel slot a preset selects', () => {
    const wheelStep = new PresetStep();
    const slot = new FixtureCapabilityValue();
    slot.type = FixtureCapabilityType.WheelSlot;
    slot.profileUuid = 'head';
    slot.wheel = 'Color Wheel';
    slot.slotNumber = 2;
    const withoutSlot = new FixtureCapabilityValue();
    withoutSlot.type = FixtureCapabilityType.WheelSlot;
    wheelStep.fixtureCapabilityValues = [withoutSlot, slot];

    const wheel = {};
    spyOn(fixtureService, 'getProfileByUuid').and.callFake(((uuid: string) => (uuid === 'head' ? {} : undefined)) as any);
    spyOn(fixtureService, 'getWheelByName').and.returnValue(wheel as any);
    const mixed = spyOn(fixtureService, 'getMixedWheelSlotColor').and.returnValue(new Color(0, 0, 255));

    expect(service.getDerivedPresetColor(preset('blue', wheelStep))).toBe('#0000ff');
    expect(mixed).toHaveBeenCalledWith(wheel as any, 2);
  });

  it('marks a scene with the colors of its presets, each once', () => {
    const mixColors = spyOn(fixtureService, 'mixColors').and.callFake((colors: Color[]) => colors[colors.length - 1]);
    const presets = [preset('red', step(1, 0, 0)), preset('blue', step(0, 0, 1)), preset('dark', new PresetStep())];
    (presetService as any).getPresetByUuid = (uuid: string) => presets.find((candidate) => candidate.uuid === uuid);
    const scene = new Scene();
    scene.color = '#945fda';
    scene.presetUuids = ['red', 'missing', 'dark', 'blue', 'red'];

    expect(service.getSceneColor(scene)).toBe('#0000ff');
    expect(mixColors.calls.mostRecent().args[0].length).toBe(2);

    // none of them is marked: the color of the scene
    scene.presetUuids = ['dark'];
    expect(service.getSceneColor(scene)).toBe('#945fda');

    scene.presetUuids = ['red'];
    scene.colorAuto = false;
    expect(service.getSceneColor(scene)).toBe('#945fda');
  });

  it('gives the new scenes the colors of the palette in turn', () => {
    expect(service.getNewSceneColor(0)).toBe(service.palette[0]);
    expect(service.getNewSceneColor(service.palette.length + 1)).toBe(service.palette[1]);
    expect(service.pickerColors.slice(0, service.palette.length)).toEqual(service.palette);
  });

  it('paints a color at an opacity, one which cannot be read in white', () => {
    expect(service.toRgba('#ff8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(service.toRgba(undefined, 1)).toBe('rgba(255, 255, 255, 1)');
  });
});
