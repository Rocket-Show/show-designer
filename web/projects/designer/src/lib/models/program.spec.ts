import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureProfile } from './fixture-profile';
import { getProgramChannelValue, getPrograms } from './program';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

function channelOf(channel: any): CachedFixtureChannel {
  const profile = new FixtureProfile({
    uuid: 'profile',
    availableChannels: { Channel: channel },
    modes: [{ name: 'Mode', shortName: 'mode', channels: ['Channel'] }],
  });

  return fixtureService.getCachedChannels(profile, profile.modes[0], null)[0];
}

describe('program', () => {
  const programs = channelOf({
    capabilities: [
      { dmxRange: [0, 9], type: 'NoFunction' },
      { dmxRange: [100, 255], type: 'Effect', effectName: 'Auto 3', speedStart: 'fast', speedEnd: 'slow' },
      { dmxRange: [10, 39], type: 'Effect', effectName: 'Auto 1', speedStart: 'slow', speedEnd: 'fast' },
      { dmxRange: [40, 69], type: 'Effect', effectName: 'Auto 2' },
      { dmxRange: [70, 99], type: 'Effect', effectName: 'Sound 1', soundControlled: true },
    ],
  });

  it('should number the programs of a channel in the order of their values, to the sound on their own', () => {
    expect(getPrograms(programs, false).map((program) => program.capability.effectName)).toEqual(['Auto 1', 'Auto 2', 'Auto 3']);
    expect(getPrograms(programs, true).map((program) => program.capability.effectName)).toEqual(['Sound 1']);
  });

  it('should run a program at its speed, none as no function', () => {
    // slow to fast within the range of the program, the other way round where it runs the other way
    expect(getProgramChannelValue(programs, 1, false, 0.5)).toBeCloseTo(24.5, 9);
    expect(getProgramChannelValue(programs, 3, false, 0)).toBe(255);
    // a program without speeds in its range is played in its middle
    expect(getProgramChannelValue(programs, 2, false, 0.9)).toBe(54);
    expect(getProgramChannelValue(programs, 1, true, 0.5)).toBe(84);
    expect(getProgramChannelValue(programs, 0, false, 0.5)).toBe(4);
    // a program the channel doesn't have
    expect(getProgramChannelValue(programs, 4, false, 0.5)).toBeUndefined();
  });
});
