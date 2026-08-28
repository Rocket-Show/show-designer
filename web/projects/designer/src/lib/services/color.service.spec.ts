import { Color } from '../models/color';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
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
});
