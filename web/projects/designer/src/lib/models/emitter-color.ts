import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';

// The colors and the color temperature of a preset on the emitters of a fixture besides red, green and blue:
// - The color temperature of a preset plays on a fixture without a channel for it on its warm and its cold white (a
//   bicolor fixture): only the warm one at the warm end, both at full in the middle, only the cold one at the cold end.
//   A fixture with red, green and blue but without a warm and a cold white shows it as a color: warm white, white in
//   the middle, a cold white. Neither, if the preset sets either of them (or any of red, green and blue) itself.
// - A preset lighting the white and the amber LEDs with the parts of its colors (Preset.emittersFromColor) gives a
//   fixture with red, green, blue and white the least of red, green and blue on its white, and of the rest the amber
//   part (all of the red with three quarters as much of the green) on its amber, only the rest on red, green and blue,
//   unless the preset sets the white or the amber itself.
// Rocket Show plays them the very same way (EmitterColors).

// the color a color temperature is shown with on red, green and blue: at the warm end, in the middle, at the cold end
const temperatureColors = [
  [1, 0.6, 0.3],
  [1, 1, 1],
  [0.8, 0.88, 1],
];

// how much green the light of an amber LED has, the red at full
const amberGreen = 0.75;

// the emitters of light besides red, green and blue a step and a curve set on their own
export const emitterColors = [
  FixtureCapabilityColor.White,
  FixtureCapabilityColor['Warm White'],
  FixtureCapabilityColor['Cold White'],
  FixtureCapabilityColor.Amber,
  FixtureCapabilityColor.UV,
  FixtureCapabilityColor.Lime,
  FixtureCapabilityColor.Indigo,
];

function hasCapability(channels: CachedFixtureChannel[], type: FixtureCapabilityType, color?: FixtureCapabilityColor): boolean {
  return channels.some(
    (channel) =>
      channel.channel &&
      channel.capabilities.some(
        (channelCapability) => channelCapability.capability.type === type && (!color || channelCapability.capability.color === color)
      )
  );
}

// the last value of the passed type (and color) saying what to put on the fixture, which wins over the ones before it
function findValue(values: FixtureCapabilityValue[], type: FixtureCapabilityType, color?: FixtureCapabilityColor): FixtureCapabilityValue {
  let found: FixtureCapabilityValue;

  for (const value of values) {
    if (value.type === type && (value.color ?? undefined) === (color ?? undefined) && value.valuePercentage >= 0) {
      found = value;
    }
  }

  return found;
}

function emitterValue(color: FixtureCapabilityColor, valuePercentage: number): FixtureCapabilityValue {
  const value = new FixtureCapabilityValue();
  value.type = FixtureCapabilityType.ColorIntensity;
  value.color = color;
  value.valuePercentage = valuePercentage;
  return value;
}

// The capability values of a preset as the passed channels of a fixture play them on their emitters (see above). The
// passed values are returned as they are if nothing changes.
export function getEmitterValues(
  values: FixtureCapabilityValue[],
  channels: CachedFixtureChannel[],
  emittersFromColor: boolean
): FixtureCapabilityValue[] {
  let result = values;
  const rgb = [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue];
  const hasRgb = rgb.every((color) => hasCapability(channels, FixtureCapabilityType.ColorIntensity, color));

  // the color temperature on a warm and a cold white, or as a color
  const temperature = findValue(values, FixtureCapabilityType.ColorTemperature);

  if (temperature && !hasCapability(channels, FixtureCapabilityType.ColorTemperature)) {
    const cold = Math.min(Math.max(temperature.valuePercentage, 0), 1);

    if (
      hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Warm White']) &&
      hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Cold White'])
    ) {
      const added: FixtureCapabilityValue[] = [];

      if (!findValue(values, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Warm White'])) {
        added.push(emitterValue(FixtureCapabilityColor['Warm White'], Math.min(1, 2 * (1 - cold))));
      }

      if (!findValue(values, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Cold White'])) {
        added.push(emitterValue(FixtureCapabilityColor['Cold White'], Math.min(1, 2 * cold)));
      }

      if (added.length > 0) {
        result = [...result, ...added];
      }
    } else if (hasRgb && rgb.every((color) => !findValue(values, FixtureCapabilityType.ColorIntensity, color))) {
      const half = cold < 0.5 ? 0 : 1;
      const share = cold < 0.5 ? cold * 2 : cold * 2 - 1;

      result = [
        ...result,
        ...rgb.map((color, index) =>
          emitterValue(
            color,
            temperatureColors[half][index] + (temperatureColors[half + 1][index] - temperatureColors[half][index]) * share
          )
        ),
      ];
    }
  }

  // the white and the amber parts of the colors on their LEDs
  if (!emittersFromColor || !hasRgb) {
    return result;
  }

  const white =
    hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.White) &&
    !findValue(result, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.White);
  const amber =
    hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Amber) &&
    !findValue(result, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Amber);
  const colors = rgb.map((color) => findValue(result, FixtureCapabilityType.ColorIntensity, color));

  if ((!white && !amber) || colors.some((color) => !color)) {
    return result;
  }

  let [red, green, blue] = colors.map((color) => color.valuePercentage);
  const added: FixtureCapabilityValue[] = [];

  if (white) {
    const whitePart = Math.min(red, green, blue);
    red -= whitePart;
    green -= whitePart;
    blue -= whitePart;
    added.push(emitterValue(FixtureCapabilityColor.White, whitePart));
  }

  if (amber) {
    const amberPart = Math.min(red, green / amberGreen);
    red -= amberPart;
    green -= amberPart * amberGreen;
    added.push(emitterValue(FixtureCapabilityColor.Amber, amberPart));
  }

  const rest = [red, green, blue];

  return [
    ...result.map((value) => {
      const index = colors.indexOf(value);

      if (index < 0) {
        return value;
      }

      const restValue = new FixtureCapabilityValue(value);
      restValue.valuePercentage = rest[index];
      return restValue;
    }),
    ...added,
  ];
}
