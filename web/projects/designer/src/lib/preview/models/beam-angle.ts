import { CachedFixture } from '../../models/cached-fixture';
import { CachedFixtureCapability } from '../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { getPropertyRank } from '../../models/capability-position';
import { FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureChannelValue } from '../../models/fixture-channel-value';

// the narrowest and the widest beam the preview draws, in degrees
export const MIN_BEAM_ANGLE_DEG = 1;
export const MAX_BEAM_ANGLE_DEG = 120;

// The narrowest and the widest the lens of the fixture opens, in degrees, as its profile names them, or undefined if it
// names none which can be read
export function getLensDegrees(fixture: CachedFixture): number[] {
  const degrees = fixture?.profile?.physical?.lens?.degreesMinMax;

  if (!Array.isArray(degrees) || degrees.length < 2) {
    return undefined;
  }

  const min = Number(degrees[0]);
  const max = Number(degrees[1]);

  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.max(min, max) <= 0) {
    return undefined;
  }

  return [Math.min(min, max), Math.max(min, max)];
}

// An angle of a zoom as the fixture library writes it: a number of degrees, or a word for one end of the lens
// ("narrow", "wide"), or "closed". undefined, if it can't be read (or names an end of a lens which isn't known).
export function readZoomAngle(text: string, lens: number[]): number {
  if (text === undefined || text === null) {
    return undefined;
  }

  const trimmed = String(text).trim();

  switch (trimmed) {
    case 'narrow':
      return lens ? lens[0] : undefined;
    case 'wide':
      return lens ? lens[1] : undefined;
    case 'closed':
      return 0;
  }

  if (!trimmed.endsWith('deg')) {
    return undefined;
  }

  const degrees = getPropertyRank(trimmed);

  return Number.isFinite(degrees) ? degrees : undefined;
}

// the value a channel of the fixture is on in this frame: the one passed for it, or else its default (or 0, which is
// what goes out for a channel nothing is set on)
function getChannelValue(channel: CachedFixtureChannel, channelValues: FixtureChannelValue[]): number {
  const channelValue = channelValues.find((candidate) => candidate.channelName === channel.name);

  if (channelValue) {
    return channelValue.value;
  }

  return channel.defaultValue === undefined ? 0 : channel.defaultValue;
}

// the capability of a channel the passed value is in (see FixtureService.getCapabilityInValue)
function getCapabilityInValue(channel: CachedFixtureChannel, value: number): CachedFixtureCapability {
  for (const capability of channel.capabilities) {
    const dmxRange = capability.capability.dmxRange;

    // a capability without a range of its own covers the whole channel
    if (!dmxRange || dmxRange.length < 2 || (value >= dmxRange[0] && value <= dmxRange[1])) {
      return capability;
    }
  }

  return undefined;
}

// how far the value is through the range of the capability, from 0 (its start) to 1 (its end)
function getPositionInCapability(channel: CachedFixtureChannel, capability: CachedFixtureCapability, value: number): number {
  const dmxRange = capability.capability.dmxRange;
  let position: number;

  if (dmxRange && dmxRange.length >= 2) {
    position = dmxRange[1] === dmxRange[0] ? 0 : (value - dmxRange[0]) / (dmxRange[1] - dmxRange[0]);
  } else {
    position = channel.maxValue > 0 ? value / channel.maxValue : 0;
  }

  return Math.max(0, Math.min(1, position));
}

// how wide the zoom of the passed channel opens the beam at the passed value, or undefined if it doesn't say
function getZoomAngle(channel: CachedFixtureChannel, value: number, lens: number[]): number {
  const capability = getCapabilityInValue(channel, value);

  if (
    !capability ||
    (capability.capability.type !== FixtureCapabilityType.Zoom && capability.capability.type !== FixtureCapabilityType.BeamAngle)
  ) {
    return undefined;
  }

  const position = getPositionInCapability(channel, capability, value);
  const start = readZoomAngle(capability.capability.angleStart ?? capability.capability.angle, lens);
  const end = readZoomAngle(capability.capability.angleEnd ?? capability.capability.angle, lens);

  if (start !== undefined && end !== undefined) {
    return start + (end - start) * position;
  }

  // a zoom naming no angles of its own runs over the lens, from narrow to wide
  if (lens) {
    return lens[0] + (lens[1] - lens[0]) * position;
  }

  return undefined;
}

// How wide the beam of the fixture opens in this frame, in degrees: as far as its zoom has opened it (from the angles
// its zoom names, or else over its lens), or as wide as its lens opens (in the middle of it, if the lens has a zoom
// nothing drives). undefined, if its profile doesn't say: the preview draws the beam it always did then.
export function getBeamAngleDeg(fixture: CachedFixture, channelValues: FixtureChannelValue[]): number {
  if (!fixture) {
    return undefined;
  }

  const lens = getLensDegrees(fixture);
  let angle: number;

  for (const channel of fixture.channels) {
    if (
      !channel.channel ||
      !channel.capabilities.some(
        (capability) =>
          capability.capability.type === FixtureCapabilityType.Zoom || capability.capability.type === FixtureCapabilityType.BeamAngle
      )
    ) {
      continue;
    }

    angle = getZoomAngle(channel, getChannelValue(channel, channelValues || []), lens);

    if (angle !== undefined) {
      break;
    }
  }

  if (angle === undefined && lens) {
    angle = (lens[0] + lens[1]) / 2;
  }

  if (angle === undefined || !Number.isFinite(angle)) {
    return undefined;
  }

  return Math.max(MIN_BEAM_ANGLE_DEG, Math.min(MAX_BEAM_ANGLE_DEG, angle));
}
