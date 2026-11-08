import { FixtureCapability } from './fixture-capability';

export class FixtureChannel {
  fineChannelAliases: string[] = [];
  defaultValue: string | number;
  capability: FixtureCapability;
  capabilities: FixtureCapability[] = [];
  dmxValueResolution: string;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    if (data.fineChannelAliases) {
      this.fineChannelAliases = data.fineChannelAliases;
    }

    this.defaultValue = data.defaultValue;
    this.dmxValueResolution = data.dmxValueResolution;

    if (data.capability) {
      this.capability = new FixtureCapability(data.capability);
    } else if (data.capabilities) {
      for (const capability of data.capabilities) {
        this.capabilities.push(new FixtureCapability(capability));
      }
    }
  }
}

// How much the DMX values a profile gives a channel (the ranges of its capabilities and its default value) are
// multiplied by to be in the resolution of the channel with all of its fine channels: 256 for a channel of 16 bits
// whose values are written in 8 bits (dmxValueResolution "8bit"), 1 for one written in its full resolution, which is
// what a profile not saying it does. Rocket Show reads them the very same way (FixtureChannel).
export function getResolutionMultiplier(channel: FixtureChannel): number {
  const match = /^(8|16|24)bit$/.exec(channel?.dmxValueResolution || '');

  if (!match) {
    return 1;
  }

  const bytes = Number(match[1]) / 8;
  const fullBytes = 1 + (channel.fineChannelAliases || []).length;

  return bytes < fullBytes ? Math.pow(256, fullBytes - bytes) : 1;
}

// A capability with its range in the full resolution of its channel (see getResolutionMultiplier): from the first
// value of the start of the range written to the last one of its end (8 bits [0, 127] are 16 bits [0, 32767]). The
// capability itself, if it is written in the full resolution.
export function getCapabilityInFullResolution(capability: FixtureCapability, multiplier: number): FixtureCapability {
  if (multiplier === 1 || !capability || !capability.dmxRange || capability.dmxRange.length !== 2) {
    return capability;
  }

  const scaled = Object.assign(Object.create(Object.getPrototypeOf(capability)), capability) as FixtureCapability;
  scaled.dmxRange = [capability.dmxRange[0] * multiplier, capability.dmxRange[1] * multiplier + multiplier - 1];

  return scaled;
}
