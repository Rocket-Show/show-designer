import { CachedFixtureCapability } from './cached-fixture-capability';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapability, FixtureCapabilityType } from './fixture-capability';

// The capabilities a preset sets as a position between the two ends of what a fixture does with them, whichever
// fixture it is and whichever way round its profile runs them: from narrow to wide (zoom, also on a channel of the
// beam angle), near to far (focus), closed to open (iris), no frost to full frost, warm to cold (color temperature),
// slow to fast (strobe speed, pan/tilt speed, given as a speed or as the time a movement takes), short to long
// (strobe duration). The strobe opens the shutter at 0 and strobes from slow to fast above it, the prism is out at 0
// and in above it, the fog (or haze) is off at 0 and puts out more above it. A preset written this way plays on
// another model of fixture just the same, which a value of a channel doesn't. Rocket Show plays them the very same
// way (CapabilityPositions).
export const positionedCapabilityTypes = [
  FixtureCapabilityType.ShutterStrobe,
  FixtureCapabilityType.StrobeSpeed,
  FixtureCapabilityType.StrobeDuration,
  FixtureCapabilityType.Zoom,
  FixtureCapabilityType.Focus,
  FixtureCapabilityType.Iris,
  FixtureCapabilityType.Frost,
  FixtureCapabilityType.ColorTemperature,
  FixtureCapabilityType.Prism,
  FixtureCapabilityType.PanTiltSpeed,
  FixtureCapabilityType.FogOutput,
];

// the capabilities of a channel a positioned capability is played with: the zoom also on a channel of the beam angle,
// the fog output also on a channel of the fog (which names its kind as well, e.g. haze)
export function getPlayingTypes(type: FixtureCapabilityType): FixtureCapabilityType[] {
  switch (type) {
    case FixtureCapabilityType.Zoom:
      return [FixtureCapabilityType.Zoom, FixtureCapabilityType.BeamAngle];
    case FixtureCapabilityType.FogOutput:
      return [FixtureCapabilityType.FogOutput, FixtureCapabilityType.Fog];
    default:
      return [type];
  }
}

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
  instant: -2e9,
  short: -1e9,
  long: 1e9,
  weak: -1e9,
  strong: 1e9,
};

// a number with the unit the fixture library writes after it, e.g. "12.5deg", "3200K" or "120bpm"
const numberWithUnit = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(deg|%|m\^3\/min|m|K|Hz|bpm|rpm|s|ms|lm)?$/;

export function isPositionedCapabilityType(type: FixtureCapabilityType): boolean {
  return positionedCapabilityTypes.indexOf(type) >= 0;
}

// where a property of the fixture library lies (e.g. "10deg", "wide", "120bpm", which is 2 Hz, or "500ms", which is
// half a second), or undefined for one which can't be read
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

  switch (match[2]) {
    case 'bpm':
    case 'rpm':
      return value / 60;
    case 'ms':
      return value / 1000;
    default:
      return value;
  }
}

// is a property of the fixture library nothing at all, e.g. no fog ("off" or 0)?
function isNothing(text: string): boolean {
  return text !== undefined && text !== null && (String(text).trim() === 'off' || getPropertyRank(text) === 0);
}

// the ends of a property, given for both ends of a range or for all of it at once
function ends(start: string, end: string, all: string): string[] {
  return [start || all, end || all];
}

// The property telling where the range of a capability starts and where it ends, and whether it runs the other way
// round than the capability does: a movement given by the time it takes is the slower the longer it takes.
function getRangeEnds(capability: FixtureCapability): { ends: string[]; inverted: boolean } {
  switch (capability.type) {
    case FixtureCapabilityType.Zoom:
    case FixtureCapabilityType.BeamAngle:
      return { ends: [capability.angleStart, capability.angleEnd], inverted: false };
    case FixtureCapabilityType.Focus:
      return { ends: [capability.distanceStart, capability.distanceEnd], inverted: false };
    case FixtureCapabilityType.Iris:
      return { ends: [capability.openPercentStart, capability.openPercentEnd], inverted: false };
    case FixtureCapabilityType.Frost:
      return { ends: [capability.frostIntensityStart, capability.frostIntensityEnd], inverted: false };
    case FixtureCapabilityType.ColorTemperature:
      return { ends: [capability.colorTemperatureStart, capability.colorTemperatureEnd], inverted: false };
    case FixtureCapabilityType.ShutterStrobe:
    case FixtureCapabilityType.StrobeSpeed:
      return { ends: [capability.speedStart, capability.speedEnd], inverted: false };
    case FixtureCapabilityType.StrobeDuration:
      return { ends: [capability.durationStart, capability.durationEnd], inverted: false };
    case FixtureCapabilityType.PanTiltSpeed:
      if (capability.speedStart || capability.speedEnd) {
        return { ends: [capability.speedStart, capability.speedEnd], inverted: false };
      }

      return { ends: [capability.durationStart, capability.durationEnd], inverted: true };
    case FixtureCapabilityType.FogOutput:
    case FixtureCapabilityType.Fog:
      return { ends: ends(capability.fogOutputStart, capability.fogOutputEnd, capability.fogOutput), inverted: false };
    default:
      return { ends: [undefined, undefined], inverted: false };
  }
}

// does the range of the capability run from its high end to its low end (e.g. from wide to narrow)? A range which
// doesn't say runs from low to high.
export function isRangeReversed(capability: FixtureCapability): boolean {
  const range = getRangeEnds(capability);
  const start = getPropertyRank(range.ends[0]);
  const end = getPropertyRank(range.ends[1]);

  return start !== undefined && end !== undefined && (range.inverted ? start < end : start > end);
}

// does a capability put out nothing over all of its range, e.g. a fog machine switched off?
function putsOutNothing(capability: FixtureCapability): boolean {
  const range = getRangeEnds(capability);

  return isNothing(range.ends[0]) && isNothing(range.ends[1]);
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

// the capabilities of the channel a positioned capability is played with (see getPlayingTypes)
function ofType(channel: CachedFixtureChannel, type: FixtureCapabilityType): CachedFixtureCapability[] {
  const types = getPlayingTypes(type);

  return channel.capabilities.filter((channelCapability) => types.indexOf(channelCapability.capability.type) >= 0);
}

// the capability of the channel switching the passed one off: "no function" on a channel which has the passed one
// (e.g. "no strobe" below the strobe of a par)
function getOff(channel: CachedFixtureChannel, type: FixtureCapabilityType): CachedFixtureCapability {
  if (ofType(channel, type).length === 0) {
    return undefined;
  }

  return channel.capabilities.filter((channelCapability) => channelCapability.capability.type === FixtureCapabilityType.NoFunction)[0];
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

  if (type === FixtureCapabilityType.FogOutput && valuePercentage <= 0) {
    // the fog off, or else no function, or else the low end of what it puts out
    const off = ofType(channel, type).find((channelCapability) => putsOutNothing(channelCapability.capability));

    return off || getOff(channel, type) || getWidest(channel, ofType(channel, type));
  }

  return getWidest(channel, ofType(channel, type));
}

// Is a capability played at a single value (its middle) instead of at a position within it: what switches the
// capability off (the shutter open, no strobe, no fog) and a prism in or out
function isSingleValue(type: FixtureCapabilityType, valuePercentage: number, capability: FixtureCapability): boolean {
  if (getPlayingTypes(type).indexOf(capability.type) < 0 || type === FixtureCapabilityType.Prism) {
    return true;
  }

  if (type === FixtureCapabilityType.ShutterStrobe && valuePercentage <= 0) {
    return true;
  }

  return type === FixtureCapabilityType.FogOutput && valuePercentage <= 0 && putsOutNothing(capability);
}

// the value of a channel playing a positioned capability value (0 to 1), or undefined if the channel doesn't do it
export function getPositionedChannelValue(channel: CachedFixtureChannel, type: FixtureCapabilityType, valuePercentage: number): number {
  const channelCapability = getPositionedCapability(channel, type, valuePercentage);

  if (!channelCapability) {
    return undefined;
  }

  const capability = channelCapability.capability;

  if (isSingleValue(type, valuePercentage, capability)) {
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
