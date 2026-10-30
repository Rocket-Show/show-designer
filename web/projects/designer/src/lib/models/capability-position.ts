import { CachedFixtureCapability } from './cached-fixture-capability';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapability, FixtureCapabilityType } from './fixture-capability';

// The capabilities a preset sets as a position between the two ends of what a fixture does with them, whichever
// fixture it is and whichever way round its profile runs them: from narrow to wide (zoom), near to far (focus),
// closed to open (iris), no frost to full frost, warm to cold (color temperature), slow to fast (strobe speed). The
// strobe opens the shutter at 0 and strobes from slow to fast above it, the prism is out at 0 and in above it. A
// preset written this way plays on another model of fixture just the same, which a value of a channel doesn't.
// Rocket Show plays them the very same way (CapabilityPositions).
export const positionedCapabilityTypes = [
  FixtureCapabilityType.ShutterStrobe,
  FixtureCapabilityType.StrobeSpeed,
  FixtureCapabilityType.Zoom,
  FixtureCapabilityType.Focus,
  FixtureCapabilityType.Iris,
  FixtureCapabilityType.Frost,
  FixtureCapabilityType.ColorTemperature,
  FixtureCapabilityType.Prism,
];

// where the words of the fixture library lie among the numbers it gives the same property in (e.g. "narrow" below
// any angle and "wide" above it), to tell which way round a range runs
const wordRanks: { [word: string]: number } = {
  closed: -2e9,
  narrow: -1e9,
  wide: 1e9,
  open: 1e9,
  near: -1e9,
  far: 1e9,
  off: -2e9,
  low: -1e9,
  high: 1e9,
  warm: -2e9,
  CTO: -1e9,
  default: 6500,
  CTB: 1e9,
  cold: 2e9,
  stop: -2e9,
  slow: -1e9,
  fast: 1e9,
};

// a number with the unit the fixture library writes after it, e.g. "12.5deg", "3200K" or "120bpm"
const numberWithUnit = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(deg|%|m|K|Hz|bpm|s|ms|lm)?$/;

export function isPositionedCapabilityType(type: FixtureCapabilityType): boolean {
  return positionedCapabilityTypes.indexOf(type) >= 0;
}

// where a property of the fixture library lies (e.g. "10deg", "wide" or "120bpm", which is 2 Hz), or undefined for
// one which can't be read
export function getPropertyRank(text: string): number {
  if (text === undefined || text === null) {
    return undefined;
  }

  const trimmed = String(text).trim();

  if (Object.prototype.hasOwnProperty.call(wordRanks, trimmed)) {
    return wordRanks[trimmed];
  }

  const match = numberWithUnit.exec(trimmed);

  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);

  return match[2] === 'bpm' ? value / 60 : value;
}

// the property telling where the range of a capability starts and where it ends
function getRangeEnds(capability: FixtureCapability): string[] {
  switch (capability.type) {
    case FixtureCapabilityType.Zoom:
      return [capability.angleStart, capability.angleEnd];
    case FixtureCapabilityType.Focus:
      return [capability.distanceStart, capability.distanceEnd];
    case FixtureCapabilityType.Iris:
      return [capability.openPercentStart, capability.openPercentEnd];
    case FixtureCapabilityType.Frost:
      return [capability.frostIntensityStart, capability.frostIntensityEnd];
    case FixtureCapabilityType.ColorTemperature:
      return [capability.colorTemperatureStart, capability.colorTemperatureEnd];
    case FixtureCapabilityType.ShutterStrobe:
    case FixtureCapabilityType.StrobeSpeed:
      return [capability.speedStart, capability.speedEnd];
    default:
      return [undefined, undefined];
  }
}

// does the range of the capability run from its high end to its low end (e.g. from wide to narrow)? A range which
// doesn't say runs from low to high.
export function isRangeReversed(capability: FixtureCapability): boolean {
  const ends = getRangeEnds(capability);
  const start = getPropertyRank(ends[0]);
  const end = getPropertyRank(ends[1]);

  return start !== undefined && end !== undefined && start > end;
}

// how much of the channel a capability takes: one without a range of its own takes all of it
function getRangeWidth(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability): number {
  const dmxRange = channelCapability.capability.dmxRange;

  if (!dmxRange || dmxRange.length < 2) {
    return channel.maxValue;
  }

  return dmxRange[1] - dmxRange[0];
}

// the widest of the passed capabilities of the channel, the first of them as wide
function getWidest(channel: CachedFixtureChannel, capabilities: CachedFixtureCapability[]): CachedFixtureCapability {
  let widest: CachedFixtureCapability;

  for (const channelCapability of capabilities) {
    if (!widest || getRangeWidth(channel, channelCapability) > getRangeWidth(channel, widest)) {
      widest = channelCapability;
    }
  }

  return widest;
}

function ofType(channel: CachedFixtureChannel, type: FixtureCapabilityType): CachedFixtureCapability[] {
  return channel.capabilities.filter((channelCapability) => channelCapability.capability.type === type);
}

// the capability of the channel switching the passed one off: "no function" on a channel which has the passed one
// (e.g. "no strobe" below the strobe of a par)
function getOff(channel: CachedFixtureChannel, type: FixtureCapabilityType): CachedFixtureCapability {
  if (ofType(channel, type).length === 0) {
    return undefined;
  }

  return ofType(channel, FixtureCapabilityType.NoFunction)[0];
}

// the capability of the channel a positioned capability value is played with, or undefined if the channel doesn't
// do it. A channel has one capability doing it: the widest one, unless the value says which kind it is.
export function getPositionedCapability(
  channel: CachedFixtureChannel,
  type: FixtureCapabilityType,
  valuePercentage: number
): CachedFixtureCapability {
  if (type === FixtureCapabilityType.ShutterStrobe) {
    if (valuePercentage > 0) {
      // a strobe flashing on its own, not at random or to the sound, or else any of them
      const strobes = ofType(channel, type).filter((channelCapability) => channelCapability.capability.shutterEffect === 'Strobe');
      const regular = strobes.filter(
        (channelCapability) => !channelCapability.capability.randomTiming && !channelCapability.capability.soundControlled
      );

      return getWidest(channel, regular.length > 0 ? regular : strobes);
    }

    // the shutter open, or else no strobe
    const open = ofType(channel, type).find((channelCapability) => channelCapability.capability.shutterEffect === 'Open');

    return open || getOff(channel, type);
  }

  if (type === FixtureCapabilityType.Prism) {
    if (valuePercentage > 0) {
      // a prism standing still, or else any of them
      const prisms = ofType(channel, type);
      const still = prisms.filter((channelCapability) => !channelCapability.capability.speedStart && !channelCapability.capability.speed);

      return still.length > 0 ? still[0] : prisms[0];
    }

    return getOff(channel, type);
  }

  return getWidest(channel, ofType(channel, type));
}

// the value of a channel playing a positioned capability value (0 to 1), or undefined if the channel doesn't do it
export function getPositionedChannelValue(channel: CachedFixtureChannel, type: FixtureCapabilityType, valuePercentage: number): number {
  const channelCapability = getPositionedCapability(channel, type, valuePercentage);

  if (!channelCapability) {
    return undefined;
  }

  const capability = channelCapability.capability;

  // the shutter open, a strobe switched off and a prism in or out are a single value
  if (
    capability.type !== type ||
    type === FixtureCapabilityType.Prism ||
    (type === FixtureCapabilityType.ShutterStrobe && valuePercentage <= 0)
  ) {
    return channelCapability.centerValue;
  }

  const position = isRangeReversed(capability) ? 1 - valuePercentage : valuePercentage;

  if (channel.capabilities.length === 1) {
    // the whole channel
    return channel.maxValue * position;
  }

  const dmxRange = capability.dmxRange;

  if (!dmxRange || dmxRange.length < 2) {
    return undefined;
  }

  return dmxRange[0] + (dmxRange[1] - dmxRange[0]) * position;
}
