import { CachedFixture } from '../models/cached-fixture';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Project } from '../models/project';
import { DmxService } from './dmx.service';
import { FixturePixelGroupResolveService } from './fixture-pixel-group-resolve.service';
import { FixtureService } from './fixture.service';

// The DMX channels of the fixtures and the values sent on them, like Rocket Show sends them (see DesignerDmxTest there):
// an RGB par with an unused channel at address 1, a moving head with 16 bit pan and tilt at address 11 and a bar with
// a dimmer and a red for each of its two pixels at address 21, all in the front universe.
describe('DmxService', () => {
  let service: DmxService;
  let fixtureService: FixtureService;
  let project: Project;
  let previews: number;

  beforeEach(() => {
    project = new Project({
      masterDimmerValue: 1,
      fixtureProfiles: [
        {
          uuid: 'par',
          name: 'RGB par',
          availableChannels: {
            Dimmer: { capability: { type: 'Intensity' } },
            Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
            Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
            Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
            Strobe: { capability: { type: 'ShutterStrobe', shutterEffect: 'Strobe' } },
          },
          modes: [{ name: '6-channel', shortName: '6ch', channels: ['Dimmer', 'Red', 'Green', 'Blue', null, 'Strobe'] }],
        },
        {
          uuid: 'head',
          name: 'Moving head',
          availableChannels: {
            Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' } },
            Tilt: { fineChannelAliases: ['Tilt fine'], capability: { type: 'Tilt', angleStart: '0deg', angleEnd: '270deg' } },
            Dimmer: { capability: { type: 'Intensity' } },
          },
          modes: [{ name: '5-channel', shortName: '5ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Dimmer'] }],
        },
        {
          uuid: 'bar',
          name: 'Bar',
          availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
          templateChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
          matrix: { pixelKeys: [[['A', 'B']]] },
          modes: [
            {
              name: '3-channel',
              shortName: '3ch',
              channels: [
                'Dimmer',
                { insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] },
              ],
            },
          ],
        },
      ],
      fixtures: [
        { uuid: 'par-1', name: 'Par 1', profileUuid: 'par', modeShortName: '6ch', dmxUniverseUuid: 'front', dmxFirstChannel: 0 },
        { uuid: 'head', name: 'Head', profileUuid: 'head', modeShortName: '5ch', dmxUniverseUuid: 'front', dmxFirstChannel: 10 },
        { uuid: 'bar', name: 'Bar', profileUuid: 'bar', modeShortName: '3ch', dmxUniverseUuid: 'front', dmxFirstChannel: 20 },
      ],
    });

    const projectService: any = { project };
    fixtureService = new FixtureService(undefined, projectService, undefined, undefined, undefined, new FixturePixelGroupResolveService());
    fixtureService.updateCachedFixtures();

    previews = 0;
    const livePreviewService: any = { previewLive: () => previews++ };
    service = new DmxService(fixtureService, projectService, livePreviewService);
  });

  function cachedFixture(uuid: string, pixelKey?: string): CachedFixture {
    return fixtureService.cachedFixtures.find((candidate) => candidate.fixture.uuid === uuid && candidate.pixel?.key === pixelKey);
  }

  function value(channelName: string, channelValue: number): FixtureChannelValue {
    return new FixtureChannelValue({ channelName, profileUuid: undefined, value: channelValue });
  }

  // what is patched to the passed addresses (counted from 1), by the names of the channels of the modes
  function patched(first: number, last: number): string[] {
    return service
      .getPatch('front')
      .slice(first - 1, last)
      .map((outputs) => outputs.map((output) => output.name).join(','));
  }

  it('patches the channels of the modes from the first channel of each fixture, an unused channel taking its address', () => {
    expect(patched(1, 6)).toEqual(['Dimmer', 'Red', 'Green', 'Blue', '', 'Strobe']);
    expect(patched(7, 10)).toEqual(['', '', '', '']);
  });

  it('patches a fine channel to the channel it is the fine one of', () => {
    expect(patched(11, 15)).toEqual(['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Dimmer']);

    const pan = service.getPatch('front')[11][0];
    expect(pan.channel.name).toBe('Pan');
    expect(pan.fineIndex).toBe(0);
  });

  it('patches the channels repeated for the pixels to their pixels', () => {
    expect(patched(21, 23)).toEqual(['Dimmer', 'Red A', 'Red B']);
    expect(service.getPatch('front')[21][0].cachedFixture).toBe(cachedFixture('bar', 'A'));
  });

  it('patches nothing to another universe', () => {
    expect(service.getPatch('back').every((outputs) => outputs.length === 0)).toBe(true);
  });

  it('sends the values split into the bytes of their fine channels', () => {
    const values = new Map<CachedFixture, FixtureChannelValue[]>([
      [cachedFixture('par-1'), [value('Dimmer', 255), value('Red', 128)]],
      [cachedFixture('head'), [value('Pan', 32767.5), value('Tilt', 258)]],
    ]);

    const universe = service.getUniverseValues('front', values);

    expect(universe.length).toBe(512);
    expect(universe.slice(0, 6)).toEqual([255, 128, 0, 0, 0, 0]);
    expect(universe.slice(10, 14)).toEqual([127, 255, 1, 2]);
    expect(service.getUniverseValues('back', values).every((byte) => byte === 0)).toBe(true);
  });

  it('dims the brightness by the master dimmer, and nothing else', () => {
    project.masterDimmerValue = 0.5;
    const values = new Map<CachedFixture, FixtureChannelValue[]>([[cachedFixture('par-1'), [value('Dimmer', 255), value('Red', 255)]]]);

    expect(service.getUniverseValues('front', values).slice(0, 2)).toEqual([127, 255]);
  });

  it('holds a channel at the value of its fader, over what the presets put on it and after the master dimmer', () => {
    project.masterDimmerValue = 0.5;
    const values = new Map<CachedFixture, FixtureChannelValue[]>([[cachedFixture('par-1'), [value('Dimmer', 255)]]]);

    service.setOverride('front', 0, 200);
    service.setOverride('front', 99, 300.4);
    service.setOverride('back', 1, 5);

    const universe = service.getUniverseValues('front', values);
    expect(universe[0]).toBe(200);
    expect(universe[99]).toBe(255);
    expect(previews).toBe(3);
    expect(project.dmxOverrides.length).toBe(3);

    // moving a held fader again holds it at the new value
    service.setOverride('front', 0, 10);
    expect(service.getUniverseValues('front', values)[0]).toBe(10);
    expect(project.dmxOverrides.length).toBe(3);
  });

  it('lets go of a fader, of the faders of a universe and of all of them', () => {
    service.setOverride('front', 0, 200);
    service.setOverride('front', 1, 200);
    service.setOverride('back', 1, 5);

    service.releaseOverride('front', 0);
    expect(service.getOverride('front', 0)).toBeUndefined();
    expect(service.getOverride('front', 1)).toBeDefined();

    service.releaseOverrides('front');
    expect(project.dmxOverrides.map((dmxOverride) => dmxOverride.universeUuid)).toEqual(['back']);

    service.releaseOverrides();
    expect(project.dmxOverrides).toEqual([]);
  });

  it('shows a held fader in the values of its fixture, on the byte of its channel', () => {
    const head = cachedFixture('head');
    const values = [value('Pan', 32767.5), value('Dimmer', 0)];

    // nothing held: the values themselves
    expect(service.applyOverrides(head, values)).toBe(values);

    service.setOverride('front', 11, 0);
    service.setOverride('front', 14, 255);
    service.setOverride('front', 12, 1);

    const held = service.applyOverrides(head, values);
    const byName = (name: string) => held.find((candidate) => candidate.channelName === name).value;

    expect(byName('Pan')).toBe(32512.5);
    expect(byName('Dimmer')).toBe(255);
    // the tilt the presets don't put anything on, from nothing
    expect(byName('Tilt')).toBe(256);
    // the values passed in stay as they are
    expect(values[0].value).toBe(32767.5);
  });

  it('forgets the faders with the next project', () => {
    service.setOverride('front', 0, 200);

    expect(new Project(JSON.parse(JSON.stringify(project))).dmxOverrides).toEqual([]);
  });
});
