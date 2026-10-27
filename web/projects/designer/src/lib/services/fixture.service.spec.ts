import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { CachedFixturePixel } from '../models/cached-fixture-pixel';
import { FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureMatrixPixelGroup } from '../models/fixture-matrix-pixel-group';
import { FixtureProfile } from '../models/fixture-profile';
import { FixtureWheel } from '../models/fixture-wheel';
import { FixturePixelGroupResolveService } from './fixture-pixel-group-resolve.service';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';

// The pixels of a fixture matrix and its pixel groups, like the Open Fixture Library defines
// them: the pixel keys are given by Z, Y and X, the positions count from 1. These mirror
// FixturePixelGroupTest in Rocket Show, which plays the same profiles on stage.
describe('FixtureService pixels and pixel groups', () => {
  // two layers of two rows with two pixels each, one of them missing
  const matrix = {
    pixelKeys: [
      [
        ['A1', 'A2'],
        ['B1', 'B2'],
      ],
      [
        ['C1', null],
        ['D1', 'D2'],
      ],
    ],
    pixelGroups: {
      All: 'all',
      Corners: ['D2', 'A1'],
      'Second row': { y: ['=2'] },
      Odd: { x: ['odd'] },
      Even: { x: ['even'] },
      'First layer of B': { z: ['<=1'], name: ['^B'] },
      'Second layer': { z: ['>=2'] },
      'Every second': { x: ['2n'] },
      'Plain number': { y: ['1'], z: ['2'] },
    },
  };

  let service: FixtureService;
  let resolveService: FixturePixelGroupResolveService;
  let fixtureProfile: FixtureProfile;

  beforeEach(() => {
    resolveService = new FixturePixelGroupResolveService();
    // the pixels are worked out from the passed profile alone, so the service is built without
    // the dependencies it needs for loading profiles
    service = new FixtureService(undefined, undefined, undefined, undefined, undefined, resolveService);
    fixtureProfile = profile(matrix);
  });

  function profile(profileMatrix: any, data: any = {}): FixtureProfile {
    return new FixtureProfile({ ...data, matrix: profileMatrix });
  }

  function describePixel(pixel: CachedFixturePixel): string {
    return pixel.key + ' ' + pixel.x + '/' + pixel.y + '/' + pixel.z;
  }

  function keys(pixelProfile: FixtureProfile, ...repeatFor: string[]): string[] {
    return service.getPixelsInOrder(pixelProfile, repeatFor).map((pixel) => pixel.key);
  }

  function group(name: string): string[] {
    return resolveService
      .getPixelsForKeyOrGroup(fixtureProfile.matrix, service.getAllPixelKeys(fixtureProfile), name)
      .map((pixel) => pixel.key);
  }

  it('places each pixel at its position', () => {
    expect(service.getAllPixelKeys(fixtureProfile).map(describePixel)).toEqual([
      'A1 1/1/1',
      'A2 2/1/1',
      'B1 1/2/1',
      'B2 2/2/1',
      'C1 1/1/2',
      'D1 1/2/2',
      'D2 2/2/2',
    ]);
  });

  it('names the pixels of a pixel count like the library', () => {
    expect(service.getAllPixelKeys(profile({ pixelCount: [3, 1, 1] })).map(describePixel)).toEqual(['1 1/1/1', '2 2/1/1', '3 3/1/1']);
    expect(keys(profile({ pixelCount: [1, 2, 1] }), 'eachPixelXYZ')).toEqual(['1', '2']);
    expect(service.getAllPixelKeys(profile({ pixelCount: [2, 2, 1] })).map(describePixel)).toEqual([
      '(1, 1) 1/1/1',
      '(2, 1) 2/1/1',
      '(1, 2) 1/2/1',
      '(2, 2) 2/2/1',
    ]);
    // X and Z
    expect(keys(profile({ pixelCount: [2, 1, 2] }), 'eachPixelXYZ')).toEqual(['(1, 1)', '(2, 1)', '(1, 2)', '(2, 2)']);
    expect(keys(profile({ pixelCount: [2, 2, 2] }), 'eachPixelXYZ')).toEqual([
      '(1, 1, 1)',
      '(2, 1, 1)',
      '(1, 2, 1)',
      '(2, 2, 1)',
      '(1, 1, 2)',
      '(2, 1, 2)',
      '(1, 2, 2)',
      '(2, 2, 2)',
    ]);
  });

  it('orders the pixels by their axes', () => {
    // the first axis changes fastest
    expect(keys(fixtureProfile, 'eachPixelXYZ')).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'D1', 'D2']);
    expect(keys(fixtureProfile, 'eachPixelYXZ')).toEqual(['A1', 'B1', 'A2', 'B2', 'C1', 'D1', 'D2']);
    expect(keys(fixtureProfile, 'eachPixelZYX')).toEqual(['A1', 'C1', 'B1', 'D1', 'A2', 'B2', 'D2']);
    expect(keys(fixtureProfile, 'eachPixelZXY')).toEqual(['A1', 'C1', 'A2', 'B1', 'D1', 'B2', 'D2']);
    expect(keys(fixtureProfile, 'eachPixelXZY')).toEqual(['A1', 'A2', 'C1', 'B1', 'B2', 'D1', 'D2']);
    expect(keys(fixtureProfile, 'eachPixelYZX')).toEqual(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'D2']);

    expect(keys(profile({ pixelCount: [3, 2, 1] }), 'eachPixelYXZ')).toEqual(['(1, 1)', '(1, 2)', '(2, 1)', '(2, 2)', '(3, 1)', '(3, 2)']);
  });

  it('orders the pixel keys by their numbers', () => {
    // 2 before 10, like the fixture library
    const bar = profile({ pixelKeys: [[['10', '2', '1', 'Spot', '11']]] });

    expect(keys(bar, 'eachPixelABC')).toEqual(['1', '2', '10', '11', 'Spot']);
  });

  it('repeats channels for pixel groups as a whole', () => {
    // e.g. "Red Corners" controls both corners
    expect(keys(fixtureProfile, 'Corners', 'Second row')).toEqual(['Corners', 'Second row']);
    expect(keys(fixtureProfile, 'eachPixelGroup')).toEqual([
      'All',
      'Corners',
      'Second row',
      'Odd',
      'Even',
      'First layer of B',
      'Second layer',
      'Every second',
      'Plain number',
    ]);
    // pixels and groups mixed, also a single one
    expect(keys(fixtureProfile, 'D2', 'Corners')).toEqual(['D2', 'Corners']);
    expect(keys(fixtureProfile, 'B1')).toEqual(['B1']);
    expect(keys(fixtureProfile, 'No such pixel')).toEqual([]);
  });

  it('resolves groups by keys', () => {
    // all alphanumerically, listed keys as listed
    expect(group('All')).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'D1', 'D2']);
    expect(group('Corners')).toEqual(['D2', 'A1']);
  });

  it('resolves groups by position', () => {
    expect(group('Second row')).toEqual(['B1', 'B2', 'D1', 'D2']);
    expect(group('Odd')).toEqual(['A1', 'B1', 'C1', 'D1']);
    expect(group('Even')).toEqual(['A2', 'B2', 'D2']);
    expect(group('Second layer')).toEqual(['C1', 'D1', 'D2']);
    expect(group('Every second')).toEqual(['A2', 'B2', 'D2']);
    expect(group('Plain number')).toEqual(['C1']);
  });

  it('combines all constraints of a group', () => {
    expect(group('First layer of B')).toEqual(['B1', 'B2']);
  });

  it('prefers a pixel key over a group', () => {
    expect(group('B2')).toEqual(['B2']);
    expect(group('No such group')).toEqual([]);
  });

  it('rejects unknown rules', () => {
    const unknownRule = new FixtureMatrixPixelGroup({ x: ['every third'] });

    expect(() => resolveService.resolveGroupPixels(unknownRule, service.getAllPixelKeys(fixtureProfile))).toThrowError(/every third/);
  });

  it('spreads the pixels over the fixture like the library places them', () => {
    // 20 cm wide, 10 cm high and 30 cm deep: X from left to right, Y from top to bottom and Z from
    // front (towards the audience) to back
    const pixels = service.getAllPixelKeys(profile(matrix, { physical: { dimensions: [200, 100, 300] } }));
    const position = (key: string) => {
      const pixel = pixels.find((p) => p.key === key);
      return [pixel.positionX, pixel.positionY, pixel.positionZ].map((value) => Math.round(value * 100) / 100);
    };

    expect(position('A1')).toEqual([-3.33, 1.67, 5]);
    expect(position('B2')).toEqual([3.33, -1.67, 5]);
    expect(position('D1')).toEqual([-3.33, -1.67, -5]);
  });

  it('shows a pixel group in the middle of its pixels', () => {
    const groupProfile = profile(matrix, { physical: { dimensions: [200, 100, 300] } });
    const [corners, secondLayer] = service.getPixelsInOrder(groupProfile, ['Corners', 'Second layer']);

    expect(corners.positionX).toBeCloseTo(0, 10);
    expect(corners.positionY).toBeCloseTo(0, 10);
    expect(corners.positionZ).toBeCloseTo(0, 10);
    // C1, D1 and D2
    expect(secondLayer.positionX).toBeCloseTo(-10 / 9, 10);
    expect(secondLayer.positionY).toBeCloseTo(-5 / 9, 10);
    expect(secondLayer.positionZ).toBeCloseTo(-5, 10);
  });

  // a bar with four pixels in two halves and channels for all of it, for each half and for each pixel
  function bar(): FixtureProfile {
    return new FixtureProfile({
      matrix: {
        pixelCount: [4, 1, 1],
        pixelGroups: { Master: 'all', 'Left half': { x: ['<=2'] }, 'Right half': { x: ['>=3'] } },
      },
      templateChannels: {
        'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } },
      },
      modes: [
        { name: 'Master', channels: ['Red Master'] },
        {
          name: 'Halves',
          channels: [
            { insert: 'matrixChannels', repeatFor: 'eachPixelGroup', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] },
          ],
        },
        {
          name: 'Right and pixels',
          channels: [
            {
              insert: 'matrixChannels',
              repeatFor: ['Right half', '1', '2'],
              channelOrder: 'perPixel',
              templateChannels: ['Red $pixelKey'],
            },
          ],
        },
        {
          name: 'Pixels',
          channels: [
            { insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] },
          ],
        },
      ],
    });
  }

  it('counts the channels of the pixel groups', () => {
    const groupBar = bar();

    expect(groupBar.modes.map((mode) => service.getModeChannelCount(groupBar, mode))).toEqual([1, 3, 3, 4]);
  });

  it('finds the channels named after a pixel group', () => {
    const groupBar = bar();

    expect(service.getCachedChannels(groupBar, groupBar.modes[0], null).map((channel) => channel.name)).toEqual(['Red Master']);
    expect(service.getCachedChannels(groupBar, groupBar.modes[1], 'Left half').map((channel) => channel.name)).toEqual(['Red Left half']);
  });

  it('reads the pixel groups saved by earlier designers and saves them like the library', () => {
    // the definitions used to be wrapped into the flag telling whether a group has all pixels
    const saved = profile({
      pixelKeys: matrix.pixelKeys,
      pixelGroups: {
        All: { isAll: 'all', constraints: null },
        Corners: { isAll: ['D2', 'A1'], constraints: null },
        'First layer of B': { isAll: { isAll: { z: ['<=1'], name: ['^B'] }, constraints: null }, constraints: null },
      },
    });

    expect(resolveService.resolveGroupPixels(saved.matrix.pixelGroups['All'], service.getAllPixelKeys(saved)).length).toBe(7);
    expect(keys(saved, 'eachPixelGroup')).toEqual(['All', 'Corners', 'First layer of B']);
    expect(JSON.parse(JSON.stringify(saved.matrix)).pixelGroups).toEqual({
      All: 'all',
      Corners: ['D2', 'A1'],
      'First layer of B': { z: ['<=1'], name: ['^B'] },
    });

    // and read again the same
    const reloaded = profile(JSON.parse(JSON.stringify(saved.matrix)));
    expect(resolveService.getPixelsForKeyOrGroup(reloaded.matrix, service.getAllPixelKeys(reloaded), 'Corners').map((p) => p.key)).toEqual([
      'D2',
      'A1',
    ]);
    expect(
      resolveService.getPixelsForKeyOrGroup(reloaded.matrix, service.getAllPixelKeys(reloaded), 'First layer of B').map((p) => p.key)
    ).toEqual(['B1', 'B2']);
  });
});

// What a preset of a brightness and a wheel slot drives the channels of a fixture to. These mirror
// FixtureLibraryTest and DesignerDmxTest in Rocket Show (with real profiles of the library).
describe('FixtureService brightness and wheel slots', () => {
  let service: FixtureService;
  let presetService: PresetService;

  beforeEach(() => {
    service = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());
    presetService = new PresetService(undefined, undefined, undefined, undefined, service, undefined, undefined, undefined);
  });

  function channel(capabilities: any): CachedFixtureChannel {
    const dimmerProfile = new FixtureProfile({
      availableChannels: { Dimmer: Array.isArray(capabilities) ? { capabilities } : { capability: capabilities } },
      modes: [{ name: 'Mode', channels: ['Dimmer'] }],
    });

    return service.getCachedChannels(dimmerProfile, dimmerProfile.modes[0], null)[0];
  }

  // the value of the channel at the passed brightness, from the capability giving it
  function value(dimmer: CachedFixtureChannel, brightness: number): number {
    const capabilityValue = new FixtureCapabilityValue();
    capabilityValue.type = FixtureCapabilityType.Intensity;
    capabilityValue.valuePercentage = brightness;

    const values = dimmer.capabilities
      .filter((capability) => capability.capability.type === FixtureCapabilityType.Intensity)
      .map((capability) => presetService.getCapabilityChannelValue(capabilityValue, dimmer, capability))
      .filter((channelValue) => channelValue !== undefined);

    // only one capability may set it
    expect(values.length).toBe(1);

    return values[0];
  }

  it('sets the brightness of a channel shared with the strobe', () => {
    // nothing, strobe from 1, nothing at 128, the brightness from 129 to 255 (not given, so off to bright)
    const sharedWithStrobe = channel([
      { dmxRange: [0, 0], type: 'NoFunction' },
      { dmxRange: [1, 127], type: 'ShutterStrobe', shutterEffect: 'Strobe', speedStart: 'slow', speedEnd: 'fast' },
      { dmxRange: [128, 128], type: 'NoFunction' },
      { dmxRange: [129, 255], type: 'Intensity' },
    ]);

    expect(value(sharedWithStrobe, 1)).toBe(255);
    expect(value(sharedWithStrobe, 0.5)).toBe(192);

    // closed until 7, from 0 % to 100 % between 8 and 134, then strobe and open
    const dimmerAndStrobe = channel([
      { dmxRange: [0, 7], type: 'ShutterStrobe', shutterEffect: 'Closed' },
      { dmxRange: [8, 134], type: 'Intensity', brightnessStart: '0%', brightnessEnd: '100%' },
      { dmxRange: [135, 239], type: 'ShutterStrobe', shutterEffect: 'Strobe', speedStart: '0Hz', speedEnd: '40Hz' },
      { dmxRange: [240, 255], type: 'ShutterStrobe', shutterEffect: 'Open' },
    ]);

    expect(value(dimmerAndStrobe, 1)).toBe(134);
    expect(Math.floor(value(dimmerAndStrobe, 0.5))).toBe(71);
  });

  it('sets a dimmer sharing its channel with an off and a strobe', () => {
    const dimmer = channel([
      { dmxRange: [0, 7], type: 'Intensity', brightness: 'off' },
      { dmxRange: [8, 134], type: 'Intensity', brightnessStart: 'dark', brightnessEnd: 'bright' },
      { dmxRange: [135, 255], type: 'ShutterStrobe', shutterEffect: 'Strobe' },
    ]);

    // half way from dark (1 %) to bright, not in the strobe range. Off is the capability giving off.
    expect(Math.floor(value(dimmer, 0.5))).toBe(70);
    expect(value(dimmer, 0)).toBe(3);
  });

  it('sets the brightness given in lumens', () => {
    const dimmer = channel([
      { dmxRange: [0, 127], type: 'Intensity', brightnessStart: '0lm', brightnessEnd: '500lm' },
      { dmxRange: [128, 255], type: 'Intensity', brightnessStart: '500lm', brightnessEnd: '1000lm' },
    ]);

    // compared to the brightest capability (1000 lm)
    expect(Math.floor(value(dimmer, 0.25))).toBe(63);
    expect(Math.floor(value(dimmer, 0.75))).toBe(191);
  });

  it('dims an inverted dimmer', () => {
    // bright at 0, off at 255
    const lightOutput = channel({ type: 'Intensity', brightnessStart: 'bright', brightnessEnd: 'off' });

    expect(value(lightOutput, 1)).toBe(0);
    expect(Math.floor(value(lightOutput, 0.25))).toBe(191);
    expect(value(lightOutput, 0)).toBe(255);

    // and the preview shows it like this
    expect(service.getBrightnessOfValue(lightOutput, lightOutput.capabilities[0], 0)).toBe(1);
    expect(service.getBrightnessOfValue(lightOutput, lightOutput.capabilities[0], 255)).toBe(0);
  });

  it('shows the brightness of a value in the preview', () => {
    const dimmer = channel([
      { dmxRange: [0, 7], type: 'Intensity', brightness: 'off' },
      { dmxRange: [8, 134], type: 'Intensity', brightnessStart: 'dark', brightnessEnd: 'bright' },
    ]);

    expect(service.getBrightnessOfValue(dimmer, dimmer.capabilities[0], 3)).toBe(0);
    expect(service.getBrightnessOfValue(dimmer, dimmer.capabilities[1], 134)).toBe(1);
    expect(service.getBrightnessOfValue(dimmer, dimmer.capabilities[1], 8)).toBe(0.01);
  });

  const wheel = new FixtureWheel({
    slots: [{ type: 'Open' }, { type: 'Color', colors: ['#ff0000'] }, { type: 'Color', colors: ['#0000ff'] }],
  });

  it('mixes the colors of a split slot', () => {
    // half red and half blue
    expect(service.getMixedWheelSlotColor(wheel, 2.5)).toEqual(jasmine.objectContaining({ red: 127.5, green: 0, blue: 127.5 }));
    // open has no color
    expect(service.getWheelSlotColors(wheel, 1.5)).toEqual(['#ff0000']);
  });

  it('counts the slots around the wheel', () => {
    // 4 is the first slot again, 0 the last
    expect(service.getWheelSlotColors(wheel, 5)).toEqual(['#ff0000']);
    expect(service.getWheelSlotColors(wheel, 0)).toEqual(['#0000ff']);
    // half blue and half open
    expect(service.getWheelSlotColors(wheel, 3.5)).toEqual(['#0000ff']);
  });
});
