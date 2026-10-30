import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureProfile } from './fixture-profile';
import { getMaintenanceCapability, getMaintenanceHoldMillis } from './maintenance';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

function channelsOf(availableChannels: any): CachedFixtureChannel[] {
  const profile = new FixtureProfile({
    uuid: 'profile',
    availableChannels,
    modes: [{ name: 'Mode', shortName: 'mode', channels: Object.keys(availableChannels) }],
  });

  return fixtureService.getCachedChannels(profile, profile.modes[0], null);
}

describe('maintenance', () => {
  const channels = channelsOf({
    Dimmer: { capability: { type: 'Intensity', comment: 'Reset' } },
    Control: {
      capabilities: [
        { dmxRange: [0, 9], type: 'NoFunction' },
        { dmxRange: [10, 19], type: 'Maintenance', comment: 'Reset pan/tilt' },
        { dmxRange: [20, 29], type: 'Maintenance', comment: 'Lamp on', hold: '3s' },
        { dmxRange: [30, 39], type: 'Maintenance', comment: ' Reset ', hold: '500ms' },
        { dmxRange: [40, 255], type: 'Maintenance' },
      ],
    },
  });

  it('should take the capability doing nothing but the action, else one doing it among other things', () => {
    expect(getMaintenanceCapability(channels, 'reset').capability.centerValue).toBe(34);
    expect(getMaintenanceCapability(channels, 'lamp-on').capability.centerValue).toBe(24);

    const partly = channelsOf({ Control: { capability: { type: 'Maintenance', comment: 'Reset pan/tilt', dmxRange: [0, 255] } } });
    expect(getMaintenanceCapability(partly, 'reset').channel.name).toBe('Control');
    expect(getMaintenanceCapability(partly, 'lamp-on')).toBeUndefined();
  });

  it('should hold it for as long as the fixture asks for', () => {
    expect(getMaintenanceHoldMillis(getMaintenanceCapability(channels, 'lamp-on').capability)).toBe(3000);
    expect(getMaintenanceHoldMillis(getMaintenanceCapability(channels, 'reset').capability)).toBe(500);
    expect(getMaintenanceHoldMillis(channels[1].capabilities[1])).toBe(0);
  });
});
