import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { Fixture } from './fixture';
import { FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureProfile } from './fixture-profile';
import {
  getAimDegrees,
  getAxisRange,
  getPanTiltChannelValue,
  getPanTiltDegrees,
  getPresetPanTiltDegrees,
  getRotationMatrix,
  getSpreadDegrees,
  getStagePlacements,
  hasAim,
  hasPanTiltValue,
  isPanTilt,
} from './pan-tilt';
import { PresetFixture } from './preset-fixture';

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

function value(type: string, data: any): FixtureCapabilityValue {
  return new FixtureCapabilityValue({ type, ...data });
}

describe('pan-tilt', () => {
  const wide = channelOf({ capability: { type: 'Pan', angleStart: '0deg', angleEnd: '630deg' } });
  const reversed = channelOf({ capability: { type: 'Tilt', angleStart: '90deg', angleEnd: '-90deg' } });
  const unknown = channelOf({ capability: { type: 'Pan' } });
  const dimmer = channelOf({ capability: { type: 'Intensity' } });

  it('should know the axes and whether a value says where to point', () => {
    expect(isPanTilt(FixtureCapabilityType.Pan)).toBe(true);
    expect(isPanTilt(FixtureCapabilityType.Tilt)).toBe(true);
    expect(isPanTilt(FixtureCapabilityType.Zoom)).toBe(false);

    expect(hasAim(value('Pan', { aimX: 0, aimY: 0, aimZ: 0 }))).toBe(true);
    expect(hasAim(value('Pan', { aimX: 0, aimY: 0 }))).toBe(false);
    expect(hasPanTiltValue(value('Pan', { valueDegrees: 0 }))).toBe(true);
    expect(hasPanTiltValue(value('Pan', { valuePercentage: 0 }))).toBe(true);
    expect(hasPanTiltValue(value('Pan', {}))).toBe(false);
  });

  it('should read how far a channel turns its fixture', () => {
    expect(getAxisRange(wide, FixtureCapabilityType.Pan)).toBe(630);
    expect(getAxisRange(reversed, FixtureCapabilityType.Tilt)).toBe(-180);
    // like the 3D preview, without angles
    expect(getAxisRange(unknown, FixtureCapabilityType.Pan)).toBe(540);
    expect(getAxisRange(channelOf({ capability: { type: 'Tilt' } }), FixtureCapabilityType.Tilt)).toBe(270);
    expect(
      getAxisRange(channelOf({ capability: { type: 'Pan', angleStart: '10deg', angleEnd: '10deg' } }), FixtureCapabilityType.Pan)
    ).toBe(540);
    // not turning on that axis at all
    expect(getAxisRange(wide, FixtureCapabilityType.Tilt)).toBeUndefined();
    expect(getAxisRange(dimmer, FixtureCapabilityType.Pan)).toBeUndefined();
  });

  it('should point every model by the same degrees, as far as it reaches', () => {
    expect(getPanTiltChannelValue(value('Pan', { valueDegrees: 90 }), wide, false, undefined)).toBeCloseTo(255 * (0.5 + 90 / 630), 9);
    expect(getPanTiltChannelValue(value('Pan', { valueDegrees: 90 }), unknown, false, undefined)).toBeCloseTo(255 * (0.5 + 90 / 540), 9);
    expect(getPanTiltChannelValue(value('Tilt', { valueDegrees: 45 }), reversed, false, undefined)).toBeCloseTo(63.75, 9);
    expect(getPanTiltChannelValue(value('Pan', { valueDegrees: 1000 }), wide, false, undefined)).toBe(255);
    expect(getPanTiltChannelValue(value('Pan', { valueDegrees: -1000 }), wide, false, undefined)).toBe(0);
    // mirrored around the middle
    expect(getPanTiltChannelValue(value('Pan', { valueDegrees: 90 }), wide, true, undefined)).toBeCloseTo(255 * (0.5 - 90 / 630), 9);
    expect(getPanTiltChannelValue(value('Pan', { valueDegrees: 90 }), dimmer, false, undefined)).toBeUndefined();
    expect(getPanTiltChannelValue(value('Pan', {}), wide, false, undefined)).toBeUndefined();
  });

  it('should play a percentage like it always was', () => {
    expect(getPanTiltChannelValue(value('Pan', { valuePercentage: 0.3 }), wide, false, undefined)).toBeCloseTo(76.5, 9);
    expect(getPanTiltChannelValue(value('Pan', { valuePercentage: 0.3 }), wide, true, undefined)).toBeCloseTo(178.5, 9);
    expect(getPanTiltDegrees(value('Pan', { valuePercentage: 0.75 }), 540, false, undefined)).toBe(135);
  });

  it('should fan the fixtures of a preset out from the first to the last', () => {
    expect(getSpreadDegrees(60, { fixtureIndex: 0, fixtureCount: 3 })).toBe(-30);
    expect(getSpreadDegrees(60, { fixtureIndex: 1, fixtureCount: 3 })).toBe(0);
    expect(getSpreadDegrees(60, { fixtureIndex: 2, fixtureCount: 3 })).toBe(30);
    expect(getSpreadDegrees(60, { fixtureIndex: 0, fixtureCount: 1 })).toBe(0);
    expect(getSpreadDegrees(undefined, { fixtureIndex: 2, fixtureCount: 3 })).toBe(0);
    expect(getSpreadDegrees(60, undefined)).toBe(0);

    // a percentage fanned out is played in degrees around it
    const fanned = value('Pan', { valuePercentage: 0.5, spreadDegrees: 126 });
    expect(getPanTiltChannelValue(fanned, wide, false, { fixtureIndex: 2, fixtureCount: 3 })).toBeCloseTo(255 * (0.5 + 63 / 630), 9);
    expect(getPanTiltChannelValue(fanned, wide, true, { fixtureIndex: 2, fixtureCount: 3 })).toBeCloseTo(255 * (0.5 - 63 / 630), 9);
  });

  it('should place the fixtures like the 3D preview', () => {
    const fixtures = [
      new Fixture({ uuid: 'a', positioning: 'topFront' }),
      new Fixture({ uuid: 'b', positioning: 'topFront' }),
      new Fixture({ uuid: 'c', positioning: 'bottomBack' }),
      new Fixture({ uuid: 'd', positioning: 'manual', positionX: 10, positionY: 20, positionZ: 30, rotationY: 90 }),
    ];
    // the pixels of a fixture count once
    const presetFixtures = [
      new PresetFixture({ fixtureUuid: 'a', pixelKey: '1' }),
      new PresetFixture({ fixtureUuid: 'a', pixelKey: '2' }),
      new PresetFixture({ fixtureUuid: 'b' }),
      new PresetFixture({ fixtureUuid: 'c' }),
      new PresetFixture({ fixtureUuid: 'gone' }),
    ];
    const placements = getStagePlacements({
      stageWidthCm: 600,
      stageHeightCm: 350,
      stageDepthCm: 600,
      stageFloorHeightCm: 30,
      fixtures,
      presetFixtures,
    });

    expect(placements.get('a')).toEqual({ position: [-100, 367, 230], rotation: [0, 0, 0] });
    expect(placements.get('b')).toEqual({ position: [100, 367, 230], rotation: [0, 0, 0] });
    expect(placements.get('c')).toEqual({ position: [0, 43, -230], rotation: [180, 0, 0] });
    expect(placements.get('d')).toEqual({ position: [10, 20, 30], rotation: [0, 90, 0] });
    expect(placements.has('gone')).toBe(false);
  });

  it('should turn by the quarters exactly', () => {
    expect(getRotationMatrix([0, 0, 0])).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    const upsideDown = getRotationMatrix([180, 0, 0]);
    expect(upsideDown[0][0]).toBe(1);
    expect(upsideDown[1][1]).toBe(-1);
    expect(upsideDown[2][2]).toBe(-1);
    expect(Math.abs(upsideDown[1][2])).toBe(0);
    expect(getRotationMatrix([0, -90, 0])[0][2]).toBe(-1);
    expect(getRotationMatrix([0, 0, 30])[1][0]).toBeCloseTo(0.5, 15);
  });

  it('should aim a hanging head at a spot, down in the middle of its ranges', () => {
    const hanging = { position: [0, 405.4, 0], rotation: [0, 0, 0] };

    expect(getAimDegrees(hanging, [0, 0, 0])).toEqual({ pan: 0, tilt: 0 });
    // straight towards the front of the stage, 45° up from down
    const front = getAimDegrees(hanging, [0, 0, 400]);
    expect(front.pan).toBeCloseTo(0, 9);
    expect(front.tilt).toBeCloseTo(-45, 9);
    // to the side: turned either way just as far, the first way
    const side = getAimDegrees(hanging, [400, 0, 0]);
    expect(side.pan).toBeCloseTo(-90, 9);
    expect(side.tilt).toBeCloseTo(45, 9);
    // a bit behind it, the pan turning the shorter way
    const behind = getAimDegrees(hanging, [400, 0, -100]);
    expect(behind.pan).toBeGreaterThan(-90);
    expect(behind.pan).toBeLessThan(0);
    // the spot right where the head turns
    expect(getAimDegrees(hanging, [0, 400, 0])).toEqual({ pan: 0, tilt: 0 });
    // standing on the floor, upside down: up in the middle
    expect(getAimDegrees({ position: [0, 0, 0], rotation: [180, 0, 0] }, [0, 405.4, 0]).tilt).toBeCloseTo(0, 9);
  });

  it('should aim at a spot only where it knows where the fixture hangs, whatever the mirror says', () => {
    const aimed = value('Pan', { aimX: 400, aimY: 0, aimZ: 0, spreadDegrees: 20 });
    const placement = { position: [0, 405.4, 0], rotation: [0, 0, 0] };

    expect(getPanTiltDegrees(aimed, 540, true, { fixtureIndex: 0, fixtureCount: 2 })).toBeUndefined();
    expect(getPanTiltDegrees(aimed, 540, true, { fixtureIndex: 1, fixtureCount: 2, placement })).toBeCloseTo(-80, 9);
    expect(getPanTiltChannelValue(aimed, wide, false, undefined)).toBeUndefined();
  });

  it('should find where the values of a preset point a fixture, the last one winning', () => {
    const values = [
      value('Pan', { valueDegrees: 10 }),
      value('Pan', { valueDegrees: 20, profileUuid: 'other' }),
      value('Pan', { valueDegrees: 30, profileUuid: 'profile' }),
      value('Pan', {}),
      value('Tilt', { valueDegrees: 40 }),
    ];

    expect(getPresetPanTiltDegrees(values, FixtureCapabilityType.Pan, 'profile', 540, false, undefined)).toBe(30);
    expect(getPresetPanTiltDegrees(values, FixtureCapabilityType.Pan, 'profile', 540, true, undefined)).toBe(-30);
    expect(getPresetPanTiltDegrees(values, FixtureCapabilityType.Tilt, 'profile', 270, false, undefined)).toBe(40);
    expect(getPresetPanTiltDegrees([], FixtureCapabilityType.Tilt, 'profile', 270, false, undefined)).toBeUndefined();
  });
});
