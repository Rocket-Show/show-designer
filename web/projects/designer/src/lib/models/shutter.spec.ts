import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureProfile } from './fixture-profile';
import { getPositionInCapability, getShutterOpening, ShutterValue } from './shutter';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

function channelOf(channel: any): CachedFixtureChannel {
  const profile = new FixtureProfile({
    uuid: 'profile',
    availableChannels: { Channel: channel },
    modes: [{ name: 'Mode', shortName: 'mode', channels: ['Channel'] }],
  });

  return fixtureService.getCachedChannels(profile, profile.modes[0], null)[0];
}

// the channel at the passed value, with the capability it lies in
function at(channel: CachedFixtureChannel, value: number): ShutterValue {
  return { channel, capability: fixtureService.getCapabilityInValue(channel, value), value };
}

describe('shutter', () => {
  const shutter = channelOf({
    capabilities: [
      { dmxRange: [0, 9], type: 'ShutterStrobe', shutterEffect: 'Closed' },
      { dmxRange: [10, 19], type: 'ShutterStrobe', shutterEffect: 'Open' },
      { dmxRange: [20, 119], type: 'ShutterStrobe', shutterEffect: 'Strobe', speedStart: 'slow', speedEnd: 'fast' },
      { dmxRange: [120, 169], type: 'ShutterStrobe', shutterEffect: 'Pulse', speedStart: '60bpm', speedEnd: '120bpm' },
      { dmxRange: [170, 199], type: 'ShutterStrobe', shutterEffect: 'RampUp', speed: '1Hz' },
      { dmxRange: [200, 219], type: 'ShutterStrobe', shutterEffect: 'RampDown', speed: '1Hz' },
      { dmxRange: [220, 239], type: 'ShutterStrobe', shutterEffect: 'RampUpDown', speed: '1Hz' },
      { dmxRange: [240, 249], type: 'ShutterStrobe', shutterEffect: 'Strobe', speed: '0Hz' },
      { dmxRange: [250, 255], type: 'ShutterStrobe', shutterEffect: 'Strobe', speedStart: '10%', speedEnd: '100%' },
    ],
  });

  it('should let all the light through while open or without a shutter, and none while closed', () => {
    expect(getShutterOpening({}, 0)).toBe(1);
    expect(getShutterOpening({ shutter: at(shutter, 15) }, 0)).toBe(1);
    expect(getShutterOpening({ shutter: at(shutter, 5) }, 0)).toBe(0);
  });

  it('should flash as fast as the profile says for the value, lit for a part of each flash', () => {
    // slow: once a second
    expect(getShutterOpening({ shutter: at(shutter, 20) }, 100)).toBe(1);
    expect(getShutterOpening({ shutter: at(shutter, 20) }, 500)).toBe(0);
    expect(getShutterOpening({ shutter: at(shutter, 20) }, 1100)).toBe(1);

    // standing still, or a speed which says nothing about the time (a default speed)
    expect(getShutterOpening({ shutter: at(shutter, 245) }, 500)).toBe(1);
    expect(getShutterOpening({ shutter: at(shutter, 252) }, 0)).toBe(1);
    expect(getShutterOpening({ shutter: at(shutter, 252) }, 100)).toBe(0);
  });

  it('should pulse and ramp', () => {
    // a pulse once a second, dark at its start and fully open in its middle
    expect(getShutterOpening({ shutter: at(shutter, 120) }, 0)).toBeCloseTo(0, 9);
    expect(getShutterOpening({ shutter: at(shutter, 120) }, 500)).toBeCloseTo(1, 9);
    expect(getShutterOpening({ shutter: at(shutter, 180) }, 250)).toBeCloseTo(0.25, 9);
    expect(getShutterOpening({ shutter: at(shutter, 210) }, 250)).toBeCloseTo(0.75, 9);
    expect(getShutterOpening({ shutter: at(shutter, 230) }, 250)).toBeCloseTo(0.5, 9);
  });

  it('should flash as fast as a channel of the speed says, and as long as one of the duration says', () => {
    const speed = channelOf({ capability: { type: 'StrobeSpeed', speedStart: '1Hz', speedEnd: '11Hz' } });
    const duration = channelOf({ capability: { type: 'StrobeDuration', durationStart: '100ms', durationEnd: '900ms' } });
    const strobing = at(shutter, 20);

    // twice a second, each flash a tenth of a second long
    const settings = { shutter: strobing, speed: at(speed, 25.5), duration: at(duration, 0) };
    expect(getShutterOpening(settings, 50)).toBe(1);
    expect(getShutterOpening(settings, 150)).toBe(0);
    expect(getShutterOpening(settings, 550)).toBe(1);

    // a flash lasting nearly all of its time stays a flash
    settings.duration = at(duration, 255);
    expect(getShutterOpening(settings, 460)).toBe(0);

    // a duration not given by a duration channel says nothing
    settings.duration = at(speed, 0);
    expect(getShutterOpening(settings, 200)).toBe(0);
  });

  it('should read where a value lies within its capability', () => {
    expect(getPositionInCapability(at(shutter, 69.5))).toBeCloseTo(0.5, 9);
    expect(getPositionInCapability({ channel: shutter, capability: shutter.capabilities[0], value: 50 })).toBe(1);

    const whole = channelOf({ capability: { type: 'StrobeSpeed', speedStart: '1Hz', speedEnd: '11Hz' } });
    expect(getPositionInCapability(at(whole, 51))).toBeCloseTo(0.2, 9);
  });
});
