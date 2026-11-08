import { getOff, getRangeValue, isRangeReversed } from './capability-position';
import { CachedFixtureCapability } from './cached-fixture-capability';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapabilityType } from './fixture-capability';

// The programs a fixture runs on its own (its built-in effects and macros, the capabilities "Effect" of its profile),
// picked by their number on every model: program 1 is the first one of a channel, in the order of its values, program
// 0 none. A program to the sound is picked among the ones controlled by the sound, if the channel has any. It runs at
// the speed of the value, if its range runs through speeds (and the speed of its own channel, see EffectSpeed). Rocket
// Show plays them the very same way (Programs).

// the programs of a channel, to the sound or not, in the order of their values
export function getPrograms(channel: CachedFixtureChannel, sound: boolean): CachedFixtureCapability[] {
  const programs = channel.capabilities.filter((channelCapability) => channelCapability.capability.type === FixtureCapabilityType.Effect);
  const kind = programs.filter((channelCapability) => !!channelCapability.capability.soundControlled === !!sound);
  const ordered = (kind.length > 0 ? kind : programs).slice();

  ordered.sort((program1, program2) => (program1.capability.dmxRange?.[0] ?? 0) - (program2.capability.dmxRange?.[0] ?? 0));

  return ordered;
}

// The value of a channel running the passed program (1 for the first one) at the passed speed (0 to 1), none (0) as
// "no function" of the channel, or undefined if the channel doesn't have it
export function getProgramChannelValue(channel: CachedFixtureChannel, programNumber: number, sound: boolean, speed: number): number {
  const number = Math.round(programNumber || 0);

  if (number <= 0) {
    const off = getOff(channel, FixtureCapabilityType.Effect);
    return off ? off.centerValue : undefined;
  }

  const program = getPrograms(channel, sound)[number - 1];

  if (!program) {
    return undefined;
  }

  const capability = program.capability;

  if (!(capability.speedStart || capability.speedEnd) || !(speed >= 0)) {
    return program.centerValue;
  }

  return getRangeValue(channel, program, isRangeReversed(capability) ? 1 - speed : speed);
}
