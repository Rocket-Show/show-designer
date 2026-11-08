import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';

// The colors and the color temperature of a preset on the emitters of a fixture besides red, green and blue:
// - A preset lighting the white LEDs with the white part of its colors (Preset.whiteFromColor) gives a fixture with
//   red, green, blue and white the least of red, green and blue on its white, and only the rest on red, green and blue
//   (pure white on the white alone), unless the preset sets the white itself.
// - The color temperature of a preset plays on a fixture without a channel for it on its warm and its cold white (a
//   bicolor fixture): only the warm one at the warm end, both at full in the middle, only the cold one at the cold end,
//   unless the preset sets either of them itself.
// Rocket Show plays them the very same way (EmitterColors).

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
  whiteFromColor: boolean
): FixtureCapabilityValue[] {
  let result = values;

  // the color temperature on a warm and a cold white
  const temperature = findValue(values, FixtureCapabilityType.ColorTemperature);

  if (
    temperature &&
    !hasCapability(channels, FixtureCapabilityType.ColorTemperature) &&
    hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Warm White']) &&
    hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Cold White'])
  ) {
    const cold = Math.min(Math.max(temperature.valuePercentage, 0), 1);
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
  }

  // the white part of the colors on the white LEDs
  if (!whiteFromColor || !hasCapability(channels, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.White)) {
    return result;
  }

  const rgb = [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue];

  if (
    !rgb.every((color) => hasCapability(channels, FixtureCapabilityType.ColorIntensity, color)) ||
    findValue(values, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.White)
  ) {
    return result;
  }

  const colors = rgb.map((color) => findValue(values, FixtureCapabilityType.ColorIntensity, color));

  if (colors.some((color) => !color)) {
    return result;
  }

  const white = Math.min(colors[0].valuePercentage, colors[1].valuePercentage, colors[2].valuePercentage);

  return [
    ...result.map((value) => {
      const index = colors.indexOf(value);

      if (index < 0) {
        return value;
      }

      const rest = new FixtureCapabilityValue(value);
      rest.valuePercentage = value.valuePercentage - white;
      return rest;
    }),
    emitterValue(FixtureCapabilityColor.White, white),
  ];
}
