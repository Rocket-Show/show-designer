import { CachedFixtureCapability } from './cached-fixture-capability';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { getPropertyRank } from './capability-position';
import { FixtureCapabilityType } from './fixture-capability';

// How much of its light the shutter of a fixture lets through in the 3D preview at a moment (0 to 1): nothing while it
// is closed, all of it while it is open, and flashes while it strobes, as fast as the profile says for the value (or a
// channel of its own for the speed) and as long as a channel for the duration of a flash says. A pulse fades in and
// out, a ramp up or down. It only draws the preview: the stage plays the value of the channel itself.

// a value on a channel, with the capability of the channel it lies in
export interface ShutterValue {
  channel: CachedFixtureChannel;
  capability: CachedFixtureCapability;
  value: number;
}

export interface ShutterSettings {
  shutter?: ShutterValue;
  speed?: ShutterValue;
  duration?: ShutterValue;
}

// what the words of the fixture library stand for: flashes per second, seconds of a flash
const speedWords: { [word: string]: number } = { slow: 1, fast: 20 };
const durationWords: { [word: string]: number } = { instant: 0.01, short: 0.03, long: 0.5 };

// a strobe which doesn't say how fast it flashes
const defaultFlashesPerSecond = 8;

// the part of a flash the light is on, if nothing says how long a flash takes
const defaultFlashPart = 0.3;

// where a value lies within the range of its capability (0 to 1), like the brightness of a dimmer
export function getPositionInCapability(shutterValue: ShutterValue): number {
  const dmxRange = shutterValue.capability.capability.dmxRange;

  if (dmxRange && dmxRange.length >= 2) {
    return dmxRange[1] === dmxRange[0] ? 0 : Math.max(Math.min((shutterValue.value - dmxRange[0]) / (dmxRange[1] - dmxRange[0]), 1), 0);
  }

  return shutterValue.channel.maxValue > 0 ? shutterValue.value / shutterValue.channel.maxValue : 0;
}

// a property read at the position of the value, between the two ends of its range (or the whole of it)
function readAt(shutterValue: ShutterValue, start: string, end: string, all: string, words: { [word: string]: number }): number {
  const read = (text: string): number => {
    if (text === undefined || text === null) {
      return undefined;
    }

    const trimmed = String(text).trim();

    if (Object.prototype.hasOwnProperty.call(words, trimmed)) {
      return words[trimmed];
    }

    // a percentage says nothing about the time
    return trimmed.endsWith('%') ? undefined : getPropertyRank(trimmed);
  };

  const from = read(start || all);
  const to = read(end || all);

  if (from === undefined || to === undefined) {
    return undefined;
  }

  return from + (to - from) * getPositionInCapability(shutterValue);
}

// how many times a second the shutter flashes: as the channel of the speed says, or else the strobe itself
function getFlashesPerSecond(settings: ShutterSettings): number {
  for (const source of [settings.speed, settings.shutter]) {
    if (source) {
      const capability = source.capability.capability;
      const speed = readAt(source, capability.speedStart, capability.speedEnd, capability.speed, speedWords);

      if (speed !== undefined) {
        return speed;
      }
    }
  }

  return defaultFlashesPerSecond;
}

// how long a flash takes, in seconds, or undefined if nothing says
function getFlashSeconds(settings: ShutterSettings): number {
  if (!settings.duration || settings.duration.capability.capability.type !== FixtureCapabilityType.StrobeDuration) {
    return undefined;
  }

  const capability = settings.duration.capability.capability;

  return readAt(settings.duration, capability.durationStart, capability.durationEnd, capability.duration, durationWords);
}

// how much light the shutter lets through at the passed moment (0 to 1)
export function getShutterOpening(settings: ShutterSettings, timeMillis: number): number {
  const shutter = settings.shutter;

  if (!shutter || shutter.capability.capability.type !== FixtureCapabilityType.ShutterStrobe) {
    return 1;
  }

  const effect = shutter.capability.capability.shutterEffect;

  if (effect === 'Open') {
    return 1;
  }

  if (effect === 'Closed') {
    return 0;
  }

  const flashesPerSecond = getFlashesPerSecond(settings);

  if (!(flashesPerSecond > 0)) {
    // a strobe standing still
    return 1;
  }

  // where the shutter is within the current flash
  const phase = ((((timeMillis / 1000) * flashesPerSecond) % 1) + 1) % 1;

  switch (effect) {
    case 'Pulse':
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
    case 'RampUp':
      return phase;
    case 'RampDown':
      return 1 - phase;
    case 'RampUpDown':
      return 1 - Math.abs(2 * phase - 1);
    default: {
      // a flash (strobe, lightning, spikes, burst) lit for the part of its time it lasts
      const flashSeconds = getFlashSeconds(settings);
      const on = flashSeconds === undefined ? defaultFlashPart : Math.max(Math.min(flashSeconds * flashesPerSecond, 0.9), 0.1);

      return phase < on ? 1 : 0;
    }
  }
}
