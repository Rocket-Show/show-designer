import { getPropertyRank } from './capability-position';
import { CachedFixtureCapability } from './cached-fixture-capability';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapabilityType } from './fixture-capability';

// What the fixture pool asks a fixture to do on the live preview, through a maintenance capability of its profile:
// reset itself (e.g. a moving head which lost its position) or switch its lamp on. It is held for as long as the
// fixture asks for it (see getMaintenanceHoldMillis), over everything the presets do with it. Rocket Show plays it
// the very same way (Maintenance).
export type MaintenanceAction = 'reset' | 'lamp-on';

// a maintenance capability doing nothing but the action, and one doing it among other things
const exactly: { [action: string]: RegExp } = {
  reset: /^(fixture |total |full )?reset( all)?$/,
  'lamp-on': /^lamp on$/,
};

const among: { [action: string]: RegExp } = {
  reset: /\breset\b/,
  'lamp-on': /\blamp\s*on\b/,
};

// the channel and the capability of a fixture doing the passed action, or undefined if it can't
export function getMaintenanceCapability(
  channels: CachedFixtureChannel[],
  action: MaintenanceAction
): { channel: CachedFixtureChannel; capability: CachedFixtureCapability } {
  let found: { channel: CachedFixtureChannel; capability: CachedFixtureCapability };

  for (const channel of channels) {
    if (!channel.channel) {
      continue;
    }

    for (const capability of channel.capabilities) {
      const comment = (capability.capability.comment || '').trim().toLowerCase();

      if (capability.capability.type !== FixtureCapabilityType.Maintenance) {
        continue;
      }

      if (exactly[action].test(comment)) {
        return { channel, capability };
      }

      if (!found && among[action].test(comment)) {
        found = { channel, capability };
      }
    }
  }

  return found;
}

// how long a fixture asks the passed capability to be held for, e.g. "3s", or 0 if it doesn't say
export function getMaintenanceHoldMillis(capability: CachedFixtureCapability): number {
  const seconds = getPropertyRank(capability.capability.hold);

  return seconds > 0 ? seconds * 1000 : 0;
}
