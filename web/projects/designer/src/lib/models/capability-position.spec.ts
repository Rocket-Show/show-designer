import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import {
  getPositionedCapability,
  getPositionedChannelValue,
  getPropertyRank,
  getRotationChannelValue,
  getRotationRank,
  getShakeChannelValue,
  isOverridingCapabilityType,
  isPositionedCapabilityType,
  isRangeReversed,
  isRotationCapabilityType,
} from './capability-position';
import { FixtureCapability, FixtureCapabilityType } from './fixture-capability';
import { FixtureProfile } from './fixture-profile';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

// the channel of a profile with that channel only, cached the way the preview plays it
function channelOf(channel: any): CachedFixtureChannel {
  const profile = new FixtureProfile({
    uuid: 'profile',
    availableChannels: { Channel: channel },
    modes: [{ name: 'Mode', shortName: 'mode', channels: ['Channel'] }],
  });

  return fixtureService.getCachedChannels(profile, profile.modes[0], null)[0];
}

function range(lo: number, hi: number, type: string, extra: any = {}) {
  return { dmxRange: [lo, hi], type, ...extra };
}

describe('capability-position', () => {
  it('should know the capabilities a preset sets as a position', () => {
    for (const type of [
      'ShutterStrobe',
      'StrobeSpeed',
      'StrobeDuration',
      'Zoom',
      'Focus',
      'Iris',
      'Frost',
      'ColorTemperature',
      'Prism',
      'PanTiltSpeed',
      'FogOutput',
    ]) {
      expect(isPositionedCapabilityType(FixtureCapabilityType[type])).toBe(true, type);
    }

    for (const type of ['Intensity', 'ColorIntensity', 'Pan', 'Tilt', 'WheelSlot', 'NoFunction']) {
      expect(isPositionedCapabilityType(FixtureCapabilityType[type])).toBe(false, type);
    }
  });

  describe('getPropertyRank', () => {
    it('should read the numbers of the fixture library with their units', () => {
      expect(getPropertyRank('10deg')).toBe(10);
      expect(getPropertyRank(' 12.5% ')).toBe(12.5);
      expect(getPropertyRank('3200K')).toBe(3200);
      expect(getPropertyRank('2m')).toBe(2);
      expect(getPropertyRank('20Hz')).toBe(20);
      expect(getPropertyRank('-3')).toBe(-3);
      expect(getPropertyRank('1e3')).toBe(1000);
    });

    it('should compare beats per minute with hertz', () => {
      expect(getPropertyRank('120bpm')).toBe(2);
    });

    it('should place the words of the library among the numbers', () => {
      expect(getPropertyRank('closed')).toBeLessThan(getPropertyRank('narrow'));
      expect(getPropertyRank('narrow')).toBeLessThan(getPropertyRank('1deg'));
      expect(getPropertyRank('wide')).toBeGreaterThan(getPropertyRank('120deg'));
      expect(getPropertyRank('near')).toBeLessThan(getPropertyRank('far'));
      expect(getPropertyRank('closed')).toBeLessThan(getPropertyRank('open'));
      expect(getPropertyRank('off')).toBeLessThan(getPropertyRank('low'));
      expect(getPropertyRank('low')).toBeLessThan(getPropertyRank('high'));
      expect(getPropertyRank('warm')).toBeLessThan(getPropertyRank('CTO'));
      expect(getPropertyRank('3200K')).toBeLessThan(getPropertyRank('default'));
      expect(getPropertyRank('default')).toBeLessThan(getPropertyRank('CTB'));
      expect(getPropertyRank('CTB')).toBeLessThan(getPropertyRank('cold'));
      expect(getPropertyRank('stop')).toBeLessThan(getPropertyRank('slow'));
      expect(getPropertyRank('slow')).toBeLessThan(getPropertyRank('1Hz'));
      expect(getPropertyRank('fast')).toBeGreaterThan(getPropertyRank('50Hz'));
    });

    it('should compare times and rounds per minute', () => {
      expect(getPropertyRank('500ms')).toBe(0.5);
      expect(getPropertyRank('2s')).toBe(2);
      expect(getPropertyRank('120rpm')).toBe(2);
      expect(getPropertyRank('2m^3/min')).toBe(2);
      expect(getPropertyRank('instant')).toBeLessThan(getPropertyRank('short'));
      expect(getPropertyRank('short')).toBeLessThan(getPropertyRank('1ms'));
      expect(getPropertyRank('long')).toBeGreaterThan(getPropertyRank('60s'));
      expect(getPropertyRank('off')).toBeLessThan(getPropertyRank('weak'));
      expect(getPropertyRank('weak')).toBeLessThan(getPropertyRank('strong'));
    });

    it('should not read what is no property of the library', () => {
      expect(getPropertyRank(undefined)).toBeUndefined();
      expect(getPropertyRank(null)).toBeUndefined();
      expect(getPropertyRank('')).toBeUndefined();
      expect(getPropertyRank('0x10')).toBeUndefined();
      expect(getPropertyRank('10 parsecs')).toBeUndefined();
      expect(getPropertyRank('slow reverse')).toBeUndefined();
    });
  });

  describe('isRangeReversed', () => {
    it('should tell a range running from its high end to its low end', () => {
      expect(isRangeReversed(new FixtureCapability({ type: 'Zoom', angleStart: 'wide', angleEnd: 'narrow' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'Zoom', angleStart: '10deg', angleEnd: '40deg' }))).toBe(false);
      expect(isRangeReversed(new FixtureCapability({ type: 'Iris', openPercentStart: 'open', openPercentEnd: 'closed' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'Focus', distanceStart: 'far', distanceEnd: 'near' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'Frost', frostIntensityStart: 'high', frostIntensityEnd: 'off' }))).toBe(true);
      expect(
        isRangeReversed(new FixtureCapability({ type: 'ColorTemperature', colorTemperatureStart: '6500K', colorTemperatureEnd: '3200K' }))
      ).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'StrobeSpeed', speedStart: '20Hz', speedEnd: '60bpm' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'ShutterStrobe', speedStart: 'slow', speedEnd: 'fast' }))).toBe(false);
    });

    it('should tell a movement given by the time it takes the other way round, slow when it takes long', () => {
      expect(isRangeReversed(new FixtureCapability({ type: 'PanTiltSpeed', durationStart: '0.1s', durationEnd: '20s' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'PanTiltSpeed', durationStart: 'long', durationEnd: 'short' }))).toBe(false);
      expect(isRangeReversed(new FixtureCapability({ type: 'PanTiltSpeed', speedStart: 'fast', speedEnd: 'slow' }))).toBe(true);
      // a speed says it rather than a time
      expect(
        isRangeReversed(
          new FixtureCapability({ type: 'PanTiltSpeed', speedStart: 'slow', speedEnd: 'fast', durationStart: '0.1s', durationEnd: '20s' })
        )
      ).toBe(false);
    });

    it('should tell the ranges of the flash duration, the beam angle and the fog', () => {
      expect(isRangeReversed(new FixtureCapability({ type: 'StrobeDuration', durationStart: '5ms', durationEnd: '0.5s' }))).toBe(false);
      expect(isRangeReversed(new FixtureCapability({ type: 'BeamAngle', angleStart: '45deg', angleEnd: '4deg' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'Fog', fogOutputStart: 'strong', fogOutputEnd: 'weak' }))).toBe(true);
      expect(isRangeReversed(new FixtureCapability({ type: 'FogOutput', fogOutputStart: '100%', fogOutputEnd: '1%' }))).toBe(true);
    });

    it('should run a range which does not say from low to high', () => {
      expect(isRangeReversed(new FixtureCapability({ type: 'Zoom' }))).toBe(false);
      expect(isRangeReversed(new FixtureCapability({ type: 'Zoom', angleStart: 'wide' }))).toBe(false);
      expect(isRangeReversed(new FixtureCapability({ type: 'Zoom', angleStart: '20deg', angleEnd: '20deg' }))).toBe(false);
      // the property of another capability says nothing about this one
      expect(isRangeReversed(new FixtureCapability({ type: 'Zoom', speedStart: 'fast', speedEnd: 'slow' }))).toBe(false);
    });
  });

  describe('getPositionedChannelValue', () => {
    it('should play a position over the whole channel of a capability without a range of its own', () => {
      const zoom = channelOf({ capability: { type: 'Zoom', angleStart: '10deg', angleEnd: '40deg' } });

      expect(getPositionedChannelValue(zoom, FixtureCapabilityType.Zoom, 0)).toBe(0);
      expect(getPositionedChannelValue(zoom, FixtureCapabilityType.Zoom, 0.5)).toBe(127.5);
      expect(getPositionedChannelValue(zoom, FixtureCapabilityType.Zoom, 1)).toBe(255);
    });

    it('should play the whole fine channel', () => {
      const focus = channelOf({ fineChannelAliases: ['Focus fine'], capability: { type: 'Focus' } });

      expect(getPositionedChannelValue(focus, FixtureCapabilityType.Focus, 1)).toBe(65535);
    });

    it('should play a position from the low end of the range to its high end, whichever way round it runs', () => {
      const zoom = channelOf({
        capabilities: [range(0, 9, 'NoFunction'), range(10, 255, 'Zoom', { angleStart: 'wide', angleEnd: 'narrow' })],
      });

      // narrow at the end of the range
      expect(getPositionedChannelValue(zoom, FixtureCapabilityType.Zoom, 0)).toBe(255);
      expect(getPositionedChannelValue(zoom, FixtureCapabilityType.Zoom, 1)).toBe(10);
    });

    it('should play the widest of the capabilities of a kind, the first one of them as wide', () => {
      const frost = channelOf({
        capabilities: [range(0, 99, 'Frost'), range(100, 227, 'Frost'), range(228, 255, 'Frost')],
      });
      const twins = channelOf({ capabilities: [range(0, 127, 'Frost'), range(128, 255, 'Frost')] });

      expect(getPositionedChannelValue(frost, FixtureCapabilityType.Frost, 0)).toBe(100);
      expect(getPositionedChannelValue(twins, FixtureCapabilityType.Frost, 1)).toBe(127);
    });

    it('should leave a channel alone, which does not do it', () => {
      const zoom = channelOf({ capability: { type: 'Zoom' } });
      const prism = channelOf({ capabilities: [range(0, 127, 'Prism'), range(128, 255, 'PrismRotation')] });

      expect(getPositionedChannelValue(zoom, FixtureCapabilityType.Iris, 1)).toBeUndefined();
      // nothing taking the prism out
      expect(getPositionedChannelValue(prism, FixtureCapabilityType.Prism, 0)).toBeUndefined();
    });

    describe('a strobe', () => {
      const shutter = channelOf({
        capabilities: [
          range(0, 31, 'ShutterStrobe', { shutterEffect: 'Closed' }),
          range(32, 63, 'ShutterStrobe', { shutterEffect: 'Open' }),
          range(64, 95, 'ShutterStrobe', { shutterEffect: 'Strobe', speedStart: 'slow', speedEnd: 'fast' }),
          range(96, 127, 'ShutterStrobe', { shutterEffect: 'Open' }),
          range(128, 223, 'ShutterStrobe', { shutterEffect: 'Strobe', randomTiming: true }),
          range(224, 255, 'ShutterStrobe', { shutterEffect: 'Pulse' }),
        ],
      });

      it('should open the shutter at 0', () => {
        expect(getPositionedChannelValue(shutter, FixtureCapabilityType.ShutterStrobe, 0)).toBe(47);
      });

      it('should strobe from slow to fast above 0, on its own rather than at random', () => {
        expect(getPositionedCapability(shutter, FixtureCapabilityType.ShutterStrobe, 0.5).capability.dmxRange).toEqual([64, 95]);
        expect(getPositionedChannelValue(shutter, FixtureCapabilityType.ShutterStrobe, 0.5)).toBe(79.5);
        expect(getPositionedChannelValue(shutter, FixtureCapabilityType.ShutterStrobe, 1)).toBe(95);
      });

      it('should strobe at random, if that is all it does', () => {
        const random = channelOf({
          capabilities: [range(0, 9, 'NoFunction'), range(10, 255, 'ShutterStrobe', { shutterEffect: 'Strobe', soundControlled: true })],
        });

        expect(getPositionedChannelValue(random, FixtureCapabilityType.ShutterStrobe, 1)).toBe(255);
      });

      it('should switch off with no function, without an open shutter', () => {
        const par = channelOf({
          capabilities: [
            range(0, 9, 'NoFunction'),
            range(10, 255, 'ShutterStrobe', { shutterEffect: 'Strobe', speedStart: '1Hz', speedEnd: '20Hz' }),
          ],
        });

        expect(getPositionedChannelValue(par, FixtureCapabilityType.ShutterStrobe, 0)).toBe(4);
        expect(getPositionedChannelValue(par, FixtureCapabilityType.ShutterStrobe, 0.5)).toBe(132.5);
      });

      it('should leave a dimmer sharing its channel alone, with nothing to switch the strobe off', () => {
        const dimmer = channelOf({
          capabilities: [range(0, 127, 'Intensity'), range(128, 255, 'ShutterStrobe', { shutterEffect: 'Strobe' })],
        });

        expect(getPositionedChannelValue(dimmer, FixtureCapabilityType.ShutterStrobe, 0)).toBeUndefined();
        expect(getPositionedChannelValue(dimmer, FixtureCapabilityType.ShutterStrobe, 1)).toBe(255);
      });

      it('should not open a shutter without a range of its own', () => {
        const open = channelOf({ capability: { type: 'ShutterStrobe', shutterEffect: 'Open' } });

        expect(getPositionedChannelValue(open, FixtureCapabilityType.ShutterStrobe, 0)).toBeUndefined();
      });
    });

    describe('a zoom on a channel of the beam angle', () => {
      it('should zoom from narrow to wide', () => {
        const beam = channelOf({
          capabilities: [range(0, 9, 'NoFunction'), range(10, 255, 'BeamAngle', { angleStart: '45deg', angleEnd: '4deg' })],
        });

        expect(getPositionedChannelValue(beam, FixtureCapabilityType.Zoom, 0)).toBe(255);
        expect(getPositionedChannelValue(beam, FixtureCapabilityType.Zoom, 1)).toBe(10);
        // the beam angle is no capability of its own, the zoom sets it
        expect(isPositionedCapabilityType(FixtureCapabilityType.BeamAngle)).toBe(false);
      });
    });

    describe('fog', () => {
      it('should switch it off with a range putting out nothing', () => {
        const output = channelOf({
          capabilities: [
            range(0, 4, 'FogOutput', { fogOutput: 'off' }),
            range(5, 255, 'FogOutput', { fogOutputStart: '1%', fogOutputEnd: '100%' }),
          ],
        });

        expect(getPositionedChannelValue(output, FixtureCapabilityType.FogOutput, 0)).toBe(2);
        expect(getPositionedChannelValue(output, FixtureCapabilityType.FogOutput, 0.5)).toBe(130);
      });

      it('should switch the fog of a kind (e.g. haze) off with no function', () => {
        const haze = channelOf({
          capabilities: [range(0, 9, 'NoFunction'), range(10, 255, 'Fog', { fogType: 'Haze', fogOutputStart: 'weak' })],
        });

        expect(getPositionedChannelValue(haze, FixtureCapabilityType.FogOutput, 0)).toBe(4);
        expect(getPositionedChannelValue(haze, FixtureCapabilityType.FogOutput, 1)).toBe(255);
      });

      it('should switch it off at the low end of what it puts out, without anything else', () => {
        const pump = channelOf({ capability: { type: 'FogOutput', fogOutputStart: '0m^3/min', fogOutputEnd: '2m^3/min' } });
        const weak = channelOf({ capabilities: [range(0, 255, 'FogOutput', { fogOutputStart: 'weak', fogOutputEnd: 'strong' })] });

        expect(getPositionedChannelValue(pump, FixtureCapabilityType.FogOutput, 0)).toBe(0);
        // a single range is played over the whole channel, from where it starts
        expect(getPositionedChannelValue(weak, FixtureCapabilityType.FogOutput, 0)).toBe(0);
      });
    });

    describe('a prism', () => {
      const prism = channelOf({
        capabilities: [
          range(0, 19, 'NoFunction'),
          range(20, 127, 'Prism', { speedStart: 'slow CW', speedEnd: 'fast CW' }),
          range(128, 255, 'Prism'),
        ],
      });

      it('should take the prism out at 0', () => {
        expect(getPositionedChannelValue(prism, FixtureCapabilityType.Prism, 0)).toBe(9);
      });

      it('should put a prism standing still in above 0, at any position', () => {
        expect(getPositionedChannelValue(prism, FixtureCapabilityType.Prism, 0.1)).toBe(191);
        expect(getPositionedChannelValue(prism, FixtureCapabilityType.Prism, 1)).toBe(191);
      });

      it('should put a rotating prism in, if that is all it has', () => {
        const rotating = channelOf({ capabilities: [range(0, 19, 'NoFunction'), range(20, 255, 'Prism', { speed: 'fast CW' })] });

        expect(getPositionedChannelValue(rotating, FixtureCapabilityType.Prism, 1)).toBe(137);
      });
    });
  });

  describe('rotations', () => {
    it('should read the speeds of a rotation, clockwise above 0', () => {
      expect(getRotationRank('fast CW')).toBeGreaterThan(getRotationRank('slow CW'));
      expect(getRotationRank('slow CW')).toBeGreaterThan(0);
      expect(getRotationRank('stop')).toBe(0);
      expect(getRotationRank('slow CCW')).toBeLessThan(0);
      expect(getRotationRank('fast CCW')).toBeLessThan(getRotationRank('slow CCW'));
      expect(getRotationRank('-10rpm')).toBeCloseTo(-1 / 6, 9);
      expect(getRotationRank(undefined)).toBeUndefined();
      expect(isRotationCapabilityType(FixtureCapabilityType.PrismRotation)).toBe(true);
      expect(isRotationCapabilityType(FixtureCapabilityType.Prism)).toBe(false);
    });

    // anticlockwise from fast to slow, stopped, clockwise from slow to fast, then turning to an angle
    const gobo = channelOf({
      capabilities: [
        range(0, 63, 'WheelSlotRotation', { speedStart: 'fast CCW', speedEnd: 'slow CCW' }),
        range(64, 67, 'WheelSlotRotation', { speed: 'stop' }),
        range(68, 127, 'WheelSlotRotation', { speedStart: 'slow CW', speedEnd: 'fast CW' }),
        range(128, 255, 'WheelSlotRotation', { angleStart: '0deg', angleEnd: '360deg' }),
      ],
    });

    it('should turn either way on the range turning that way only, and stop in the middle', () => {
      expect(getRotationChannelValue(gobo, FixtureCapabilityType.WheelSlotRotation, 0)).toBe(0);
      expect(getRotationChannelValue(gobo, FixtureCapabilityType.WheelSlotRotation, 0.25)).toBeCloseTo(31.5, 9);
      expect(getRotationChannelValue(gobo, FixtureCapabilityType.WheelSlotRotation, 0.5)).toBe(65);
      expect(getRotationChannelValue(gobo, FixtureCapabilityType.WheelSlotRotation, 0.75)).toBeCloseTo(97.5, 9);
      expect(getRotationChannelValue(gobo, FixtureCapabilityType.WheelSlotRotation, 1)).toBe(127);
      // played as a position as well
      expect(getPositionedChannelValue(gobo, FixtureCapabilityType.WheelSlotRotation, 1)).toBe(127);
    });

    it('should turn a range turning both ways from where it stops', () => {
      const prism = channelOf({ capability: { type: 'PrismRotation', speedStart: '-10rpm', speedEnd: '10rpm' } });

      expect(getRotationChannelValue(prism, FixtureCapabilityType.PrismRotation, 0)).toBe(0);
      expect(getRotationChannelValue(prism, FixtureCapabilityType.PrismRotation, 0.5)).toBe(127.5);
      expect(getRotationChannelValue(prism, FixtureCapabilityType.PrismRotation, 1)).toBe(255);

      // the other way round
      const reversed = channelOf({ capability: { type: 'PrismRotation', speedStart: 'fast CW', speedEnd: 'fast CCW' } });
      expect(getRotationChannelValue(reversed, FixtureCapabilityType.PrismRotation, 1)).toBe(0);
      expect(getRotationChannelValue(reversed, FixtureCapabilityType.PrismRotation, 0)).toBe(255);
    });

    it('should stop with no function, and not turn a way the fixture does not', () => {
      const clockwise = channelOf({
        capabilities: [range(0, 9, 'NoFunction'), range(10, 255, 'Rotation', { speedStart: 'slow CW', speedEnd: 'fast CW' })],
      });

      expect(getRotationChannelValue(clockwise, FixtureCapabilityType.Rotation, 0.5)).toBe(4);
      expect(getRotationChannelValue(clockwise, FixtureCapabilityType.Rotation, 0)).toBeUndefined();
      expect(getRotationChannelValue(clockwise, FixtureCapabilityType.Rotation, 1)).toBe(255);

      // nothing stopping it
      const turning = channelOf({ capability: { type: 'Rotation', speedStart: 'slow CW', speedEnd: 'fast CW' } });
      expect(getRotationChannelValue(turning, FixtureCapabilityType.Rotation, 0.5)).toBeUndefined();

      // turned to an angle only
      const indexed = channelOf({ capability: { type: 'Rotation', angleStart: '0deg', angleEnd: '360deg' } });
      expect(getRotationChannelValue(indexed, FixtureCapabilityType.Rotation, 1)).toBeUndefined();
    });
  });

  describe('framing blades, pulses and shakes', () => {
    it('should put in the blade the value names', () => {
      const blades = channelOf({
        capabilities: [
          range(0, 127, 'BladeInsertion', { blade: 'Top', insertionStart: 'out', insertionEnd: 'in' }),
          range(128, 255, 'BladeInsertion', { blade: 'Bottom', insertionStart: '100%', insertionEnd: '0%' }),
        ],
      });

      expect(getPositionedChannelValue(blades, FixtureCapabilityType.BladeInsertion, 1, 'Top')).toBe(127);
      expect(getPositionedChannelValue(blades, FixtureCapabilityType.BladeInsertion, 1, 'Bottom')).toBe(128);
      expect(getPositionedChannelValue(blades, FixtureCapabilityType.BladeInsertion, 0, 'Bottom')).toBe(255);
      expect(getPositionedChannelValue(blades, FixtureCapabilityType.BladeInsertion, 1, 'Left')).toBeUndefined();
      // without a blade, the widest
      expect(getPositionedChannelValue(blades, FixtureCapabilityType.BladeInsertion, 0)).toBe(0);
    });

    it('should turn a blade and the whole framing shutter from one end to the other', () => {
      const turned = channelOf({ capability: { type: 'BladeSystemRotation', angleStart: '45deg', angleEnd: '-45deg' } });

      expect(getPositionedChannelValue(turned, FixtureCapabilityType.BladeSystemRotation, 1)).toBe(0);
      expect(getPositionedChannelValue(turned, FixtureCapabilityType.BladeSystemRotation, 0.5)).toBe(127.5);
    });

    it('should pulse the iris from slow to fast, and leave it alone at 0', () => {
      const iris = channelOf({
        capabilities: [
          range(0, 199, 'Iris', { openPercentStart: '100%', openPercentEnd: '0%' }),
          range(200, 255, 'IrisEffect', { effectName: 'Pulse', speedStart: 'slow', speedEnd: 'fast' }),
        ],
      });

      expect(isOverridingCapabilityType(FixtureCapabilityType.IrisEffect)).toBe(true);
      expect(isOverridingCapabilityType(FixtureCapabilityType.Iris)).toBe(false);
      expect(getPositionedChannelValue(iris, FixtureCapabilityType.IrisEffect, 0)).toBeUndefined();
      expect(getPositionedChannelValue(iris, FixtureCapabilityType.IrisEffect, 1)).toBe(255);
      expect(getPositionedCapability(iris, FixtureCapabilityType.IrisEffect, 0)).toBeUndefined();
    });

    it('should shake the gobo picked, or else the whole wheel', () => {
      const wheel = channelOf({
        capabilities: [
          range(0, 9, 'WheelSlot', { slotNumber: 1 }),
          range(10, 59, 'WheelShake', { slotNumber: 2, shakeSpeedStart: 'slow', shakeSpeedEnd: 'fast' }),
          range(60, 255, 'WheelShake', { shakeSpeedStart: 'fast', shakeSpeedEnd: 'slow' }),
        ],
      });

      expect(getShakeChannelValue(wheel, 'Channel', 2, 1)).toBe(59);
      expect(getShakeChannelValue(wheel, undefined, 2, 0.5)).toBe(34.5);
      // a gobo shaking with the wheel only
      expect(getShakeChannelValue(wheel, 'Channel', 3, 1)).toBe(60);
      // not shaking, or another wheel
      expect(getShakeChannelValue(wheel, 'Channel', 2, 0)).toBeUndefined();
      expect(getShakeChannelValue(wheel, 'Other', 2, 1)).toBeUndefined();
    });
  });
});
