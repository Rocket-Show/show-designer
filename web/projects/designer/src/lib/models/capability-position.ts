import { CachedFixtureCapability } from './cached-fixture-capability';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapability, FixtureCapabilityType } from './fixture-capability';

// The capabilities a preset sets as a position between the two ends of what a fixture does with them, whichever
// fixture it is and whichever way round its profile runs them: from narrow to wide (zoom, also on a channel of the
// beam angle), near to far (focus), closed to open (iris), no frost to full frost, warm to cold (color temperature),
// slow to fast (strobe speed, pan/tilt speed, given as a speed or as the time a movement takes), short to long
// (strobe duration), out to in (the blades of a framing shutter), from one end of their turn to the other (the blades
// and the whole framing shutter turned). The strobe opens the shutter at 0 and strobes from slow to fast above it, the
// prism is out at 0 and in above it, the fog (or haze) is off at 0 and puts out more above it, the pulse of an iris or
// a frost is off at 0 and pulses from slow to fast above it. A rotation (of a gobo, a prism or of anything else
// turning) turns anticlockwise below the middle (fastest at 0), stops in the middle and turns clockwise above it
// (fastest at 1). A preset written this way plays on another model of fixture just the same, which a value of a
// channel doesn't. Rocket Show plays them the very same way (CapabilityPositions).
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
  FixtureCapabilityType.WheelSlotRotation,
  FixtureCapabilityType.PrismRotation,
  FixtureCapabilityType.Rotation,
  FixtureCapabilityType.BladeInsertion,
  FixtureCapabilityType.BladeRotation,
  FixtureCapabilityType.BladeSystemRotation,
  FixtureCapabilityType.IrisEffect,
  FixtureCapabilityType.FrostEffect,
];

// the rotations, which turn either way
export const rotationCapabilityTypes = [
  FixtureCapabilityType.WheelSlotRotation,
  FixtureCapabilityType.PrismRotation,
  FixtureCapabilityType.Rotation,
];

// What plays over what the rest of a preset puts on the same channel, whatever order they come in: the pulse of an
// iris over the iris, the one of a frost over the frost and the shake of a gobo over the gobo. Each of them leaves the
// channel to the rest at 0.
export const overridingCapabilityTypes = [
  FixtureCapabilityType.IrisEffect,
  FixtureCapabilityType.FrostEffect,
  FixtureCapabilityType.WheelShake,
];

// the blades of a framing shutter a preset sets on every model
export const blades = ['Top', 'Right', 'Bottom', 'Left'];

export function isRotationCapabilityType(type: FixtureCapabilityType): boolean {
  return rotationCapabilityTypes.indexOf(type) >= 0;
}

export function isOverridingCapabilityType(type: FixtureCapabilityType): boolean {
  return overridingCapabilityTypes.indexOf(type) >= 0;
}

// do the capabilities of the type turn a blade of a framing shutter, which the value names?
export function isBladeCapabilityType(type: FixtureCapabilityType): boolean {
  return type === FixtureCapabilityType.BladeInsertion || type === FixtureCapabilityType.BladeRotation;
}

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
  out: -1e9,
  in: 1e9,
};

// where the speeds of a rotation lie: clockwise above 0, anticlockwise below it
const rotationWordRanks: { [word: string]: number } = {
  'fast CW': 1e9,
  'slow CW': 1e-9,
  stop: 0,
  'slow CCW': -1e-9,
  'fast CCW': -1e9,
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
    case FixtureCapabilityType.BladeInsertion:
      return { ends: ends(capability.insertionStart, capability.insertionEnd, capability.insertion), inverted: false };
    case FixtureCapabilityType.BladeRotation:
    case FixtureCapabilityType.BladeSystemRotation:
      return { ends: ends(capability.angleStart, capability.angleEnd, capability.angle), inverted: false };
    case FixtureCapabilityType.IrisEffect:
    case FixtureCapabilityType.FrostEffect:
      return { ends: ends(capability.speedStart, capability.speedEnd, capability.speed), inverted: false };
    case FixtureCapabilityType.WheelShake:
      return { ends: ends(capability.shakeSpeedStart, capability.shakeSpeedEnd, capability.shakeSpeed), inverted: false };
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
export function getWidest(channel: CachedFixtureChannel, capabilities: CachedFixtureCapability[]): CachedFixtureCapability {
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
// do it. A channel has one capability doing it: the widest one, unless the value says which kind it is. A blade is
// played by the capabilities of the blade the value names.
export function getPositionedCapability(
  channel: CachedFixtureChannel,
  type: FixtureCapabilityType,
  valuePercentage: number,
  blade?: string
): CachedFixtureCapability {
  if (isBladeCapabilityType(type)) {
    return getWidest(
      channel,
      ofType(channel, type).filter((channelCapability) => !blade || channelCapability.capability.blade === blade)
    );
  }

  if ((type === FixtureCapabilityType.IrisEffect || type === FixtureCapabilityType.FrostEffect) && valuePercentage <= 0) {
    // no pulse leaves the iris or the frost to the rest of the preset
    return undefined;
  }

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
export function getPositionedChannelValue(
  channel: CachedFixtureChannel,
  type: FixtureCapabilityType,
  valuePercentage: number,
  blade?: string
): number {
  if (isRotationCapabilityType(type)) {
    return getRotationChannelValue(channel, type, valuePercentage);
  }

  const channelCapability = getPositionedCapability(channel, type, valuePercentage, blade);

  if (!channelCapability) {
    return undefined;
  }

  const capability = channelCapability.capability;

  if (isSingleValue(type, valuePercentage, capability)) {
    return channelCapability.centerValue;
  }

  const position = isRangeReversed(capability) ? 1 - valuePercentage : valuePercentage;

  return getRangeValue(channel, channelCapability, position);
}

// the value at the passed position (0 to 1) within the range of a capability of the channel
function getRangeValue(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability, position: number): number {
  const capability = channelCapability.capability;

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

// where a speed of a rotation lies (e.g. "fast CW", "stop", "-10rpm" or "50%"), clockwise above 0, or undefined for one
// which can't be read
export function getRotationRank(text: string): number {
  if (text === undefined || text === null) {
    return undefined;
  }

  const trimmed = String(text).trim();

  if (Object.prototype.hasOwnProperty.call(rotationWordRanks, trimmed)) {
    return rotationWordRanks[trimmed];
  }

  return getPropertyRank(trimmed);
}

// the speeds a rotation runs between, or undefined for one turning to an angle instead (e.g. an indexed gobo)
function getRotationEnds(channelCapability: CachedFixtureCapability): number[] {
  const capability = channelCapability.capability;
  const start = getRotationRank(capability.speedStart || capability.speed);
  const end = getRotationRank(capability.speedEnd || capability.speed);

  return start === undefined || end === undefined ? undefined : [start, end];
}

// The value of a channel turning something at the passed speed: anticlockwise below the middle (fastest at 0), stopped
// in the middle, clockwise above it (fastest at 1), or undefined if the channel doesn't turn it that way. The widest
// range turning the asked way only is taken from slow to fast, or else one turning both ways, from where it stops.
export function getRotationChannelValue(channel: CachedFixtureChannel, type: FixtureCapabilityType, valuePercentage: number): number {
  const speed = Math.max(Math.min(valuePercentage * 2 - 1, 1), -1);
  const rotations = ofType(channel, type).filter((channelCapability) => getRotationEnds(channelCapability) !== undefined);

  if (rotations.length === 0) {
    return undefined;
  }

  // the ranges turning both ways and where they stop
  const across = rotations.filter((channelCapability) => {
    const [start, end] = getRotationEnds(channelCapability);
    return start * end < 0;
  });
  const acrossValue = (direction: number, amount: number): number => {
    const widest = getWidest(channel, across);
    const [start, end] = getRotationEnds(widest);
    const stop = start / (start - end);
    const towardsEnd = Math.sign(end) === direction;

    return getRangeValue(channel, widest, towardsEnd ? stop + (1 - stop) * amount : stop - stop * amount);
  };

  if (speed === 0) {
    const stopped = rotations.find((channelCapability) => {
      const [start, end] = getRotationEnds(channelCapability);
      return start === 0 && end === 0;
    });

    if (stopped) {
      return stopped.centerValue;
    }

    if (across.length > 0) {
      return acrossValue(1, 0);
    }

    const off = getOff(channel, type);

    return off ? off.centerValue : undefined;
  }

  const direction = Math.sign(speed);
  const oneWay = rotations.filter((channelCapability) => {
    const [start, end] = getRotationEnds(channelCapability);
    return start * direction >= 0 && end * direction >= 0 && (start !== 0 || end !== 0);
  });

  if (oneWay.length > 0) {
    const widest = getWidest(channel, oneWay);
    const [start, end] = getRotationEnds(widest);

    return getRangeValue(channel, widest, Math.abs(start) > Math.abs(end) ? 1 - Math.abs(speed) : Math.abs(speed));
  }

  return across.length > 0 ? acrossValue(direction, Math.abs(speed)) : undefined;
}

// the wheel a capability shakes: the one of its slot, the one it names or else the one named like its channel
function getShakeWheelName(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability): string {
  if (channelCapability.wheelName) {
    return channelCapability.wheelName;
  }

  return typeof channelCapability.capability.wheel === 'string' ? channelCapability.capability.wheel : channel.name;
}

// The value of a channel shaking the passed slot of a wheel (or the whole wheel) at the passed speed, from slow to
// fast, or undefined if the channel doesn't shake it or the speed is 0 (which leaves the wheel to the rest)
export function getShakeChannelValue(channel: CachedFixtureChannel, wheel: string, slotNumber: number, valuePercentage: number): number {
  if (!(valuePercentage > 0)) {
    return undefined;
  }

  const shakes = channel.capabilities.filter(
    (channelCapability) =>
      channelCapability.capability.type === FixtureCapabilityType.WheelShake &&
      (!wheel || getShakeWheelName(channel, channelCapability) === wheel) &&
      (channelCapability.capability.slotNumber === undefined || channelCapability.capability.slotNumber === slotNumber)
  );

  // the slot shaking on its own, or else the whole wheel
  const ofSlot = shakes.filter((channelCapability) => channelCapability.capability.slotNumber === slotNumber);
  const shake = getWidest(channel, ofSlot.length > 0 ? ofSlot : shakes);

  if (!shake) {
    return undefined;
  }

  return getRangeValue(channel, shake, isRangeReversed(shake.capability) ? 1 - valuePercentage : valuePercentage);
}
