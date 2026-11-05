import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';

// the filter taking away each of the colors a fixture lights with (red, green and blue)
const filters = new Map<FixtureCapabilityColor, FixtureCapabilityColor>([
  [FixtureCapabilityColor.Red, FixtureCapabilityColor.Cyan],
  [FixtureCapabilityColor.Green, FixtureCapabilityColor.Magenta],
  [FixtureCapabilityColor.Blue, FixtureCapabilityColor.Yellow],
]);

function hasColor(channels: CachedFixtureChannel[], colors: FixtureCapabilityColor[]): boolean {
  return channels.some(
    (channel) =>
      channel.channel &&
      channel.capabilities.some(
        (channelCapability) =>
          channelCapability.capability.type === FixtureCapabilityType.ColorIntensity &&
          colors.indexOf(channelCapability.capability.color) >= 0
      )
  );
}

// Does a fixture mix its colors with filters (cyan, magenta and yellow, e.g. a spot), instead of lighting red, green
// and blue?
export function mixesSubtractively(channels: CachedFixtureChannel[]): boolean {
  return !hasColor(channels, Array.from(filters.keys())) && hasColor(channels, Array.from(filters.values()));
}

// The capability values the passed channels of a fixture play: a fixture mixing its colors with filters is given the
// red, green and blue of a preset as the filters taking away what it doesn't light (full red is no cyan, full magenta
// and full yellow), so a preset lights it in its colors as well. Rocket Show plays them the very same way
// (SubtractiveColors).
export function getFixtureCapabilityValues(
  capabilityValues: FixtureCapabilityValue[],
  channels: CachedFixtureChannel[]
): FixtureCapabilityValue[] {
  if (!mixesSubtractively(channels)) {
    return capabilityValues;
  }

  return capabilityValues.map((capabilityValue) => {
    const filter = filters.get(capabilityValue.color);

    if (capabilityValue.type !== FixtureCapabilityType.ColorIntensity || !filter || !(capabilityValue.valuePercentage >= 0)) {
      return capabilityValue;
    }

    const filterValue = new FixtureCapabilityValue(capabilityValue);
    filterValue.color = filter;
    filterValue.valuePercentage = 1 - capabilityValue.valuePercentage;

    return filterValue;
  });
}
