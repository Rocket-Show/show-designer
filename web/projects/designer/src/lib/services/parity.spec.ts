import { CachedFixturePixel } from '../models/cached-fixture-pixel';
import { EffectCurve } from '../models/effect-curve';
import { FixtureCapability } from '../models/fixture-capability';
import { FixtureChannel } from '../models/fixture-channel';
import { FixtureMatrix } from '../models/fixture-matrix';
import { FixtureMatrixPixelGroup } from '../models/fixture-matrix-pixel-group';
import { Preset } from '../models/preset';
import { PresetRegionScene } from '../models/preset-region-scene';
import { parseProfileNumber } from '../models/profile-number';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { FixturePixelGroupResolveService } from './fixture-pixel-group-resolve.service';
import { FixtureService } from './fixture.service';
import { PresetStepService } from './preset-step.service';
import { PreviewService } from './preview.service';

// The designer reads and works out a project like Rocket Show does, where the two could differ:
// numbers which are null, missing or not whole, the default values, colors and pixel groups of
// the fixture library. These mirror DesignerParityTest in Rocket Show case by case.
describe('Parity with Rocket Show', () => {
  let fixtureService: FixtureService;
  let resolveService: FixturePixelGroupResolveService;

  beforeEach(() => {
    resolveService = new FixturePixelGroupResolveService();
    fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, resolveService);
  });

  it('keeps the default of a value which is null', () => {
    const scene = new Scene({ dimmer: null, fadeInMillis: null, fadeOutMillis: null });
    expect(scene.dimmer).toBe(1);
    expect(scene.fadeInMillis).toBe(0);
    expect(scene.fadeOutMillis).toBe(0);

    const curve = new EffectCurve({ lengthMillis: null, amplitude: null, position: null, curveType: null });
    expect(curve.lengthMillis).toBe(2500);
    expect(curve.amplitude).toBe(1);
    expect(curve.position).toBe(0.5);
    expect(curve.curveType).toBe('sine');
    expect(curve.visible).toBe(true);

    expect(new Project({ masterDimmerValue: null }).masterDimmerValue).toBe(1);
  });

  it('starts a scene without fades', () => {
    const scene = new Scene({});
    expect(scene.fadeInMillis).toBe(0);
    expect(scene.fadeOutMillis).toBe(0);
  });

  it('reads a name it does not know as missing', () => {
    expect(new FixtureCapability({ type: 'SomethingNew' }).type).toBeUndefined();
  });

  it('keeps the fractions of the numbers', () => {
    const curve = new EffectCurve({ lengthMillis: 1000.5, amplitude: 0.1, dutyCycle: 0.3, phasingMillis: 0.25 });
    expect(curve.lengthMillis).toBe(1000.5);
    expect(curve.amplitude).toBe(0.1);
    expect(curve.dutyCycle).toBe(0.3);
    expect(curve.getPhasingMillis(1, 2)).toBe(0.25);

    const preset = new Preset({ fadeInMillis: 1000.5, startMillis: 250.25, stepsPhasingCycles: 0.1 });
    expect(preset.fadeInMillis).toBe(1000.5);
    expect(preset.startMillis).toBe(250.25);
    expect(preset.stepsPhasingCycles).toBe(0.1);

    const region = new ScenePlaybackRegion({ startMillis: 1234.7, endMillis: 6857.142857 });
    expect(region.startMillis).toBe(1234.7);
    expect(region.endMillis).toBe(6857.142857);
  });

  it('rounds the numbers of fixtures and cycles like Rocket Show', () => {
    const curve = new EffectCurve({ phasingMillis: 100, phasingGroupSize: 1.5, runMode: 'cycles', runCycles: 1.5, lengthMillis: 1000 });
    expect(curve.getPhasingMillis(1, 4)).toBe(0);
    expect(curve.getPhasingMillis(2, 4)).toBe(100);
    expect(curve.getRunEndMillis()).toBe(2000);

    const presetStepService = new PresetStepService(undefined);
    const preset = new Preset({ stepsPhasingMillis: 100, stepsPhasingGroupSize: 1.5 });
    expect(presetStepService.getStepsPhasingMillis(preset, 1, 4)).toBe(0);
    expect(presetStepService.getStepsPhasingMillis(preset, 2, 4)).toBe(100);

    // 2.5 rounds up
    preset.stepsPhasingGroupSize = 2.5;
    expect(presetStepService.getStepsPhasingMillis(preset, 2, 4)).toBe(0);
    expect(presetStepService.getStepsPhasingMillis(preset, 3, 4)).toBe(100);
  });

  it('fades over the fractions of a millisecond', () => {
    const previewService = new PreviewService(undefined, undefined, undefined, undefined, undefined, undefined);
    const scene = new Scene({ fadeInMillis: 1000 });
    const region = new ScenePlaybackRegion({ startMillis: 0.5, endMillis: 10000 });

    expect(previewService['getPresetIntensity'](new PresetRegionScene(new Preset(), region, scene), 500.5)).toBe(0.5);
  });

  it('reads the numbers of the fixture library like Rocket Show', () => {
    expect(parseProfileNumber('12.5')).toBe(12.5);
    expect(parseProfileNumber(' 12.5 ')).toBe(12.5);
    expect(parseProfileNumber('-3')).toBe(-3);
    expect(parseProfileNumber('.5')).toBe(0.5);
    expect(parseProfileNumber('5.')).toBe(5);
    expect(parseProfileNumber('1e3')).toBe(1000);

    // neither Number() only nor Double.parseDouble() only
    expect(parseProfileNumber('1d')).toBeUndefined();
    expect(parseProfileNumber('NaN')).toBeUndefined();
    expect(parseProfileNumber('Infinity')).toBeUndefined();
    expect(parseProfileNumber('0x10')).toBeUndefined();
    expect(parseProfileNumber('')).toBeUndefined();
    expect(parseProfileNumber('bright')).toBeUndefined();
  });

  function defaultValue(data: any): number {
    return fixtureService['getDefaultValueByChannel'](new FixtureChannel(data));
  }

  it('reads the default values like Rocket Show', () => {
    // a fraction of a percent on a 16 bit channel (the designer took 12 % before)
    expect(defaultValue({ defaultValue: '12.5%', fineChannelAliases: ['Tilt fine'] })).toBe(65535 * 0.125);
    expect(defaultValue({ defaultValue: '33.3%' })).toBeCloseTo(255 * 0.333, 9);
    expect(defaultValue({ defaultValue: 128.5 })).toBe(128.5);

    // a default of 0 is one (the designer left it out before)
    expect(defaultValue({ defaultValue: 0 })).toBe(0);
    expect(defaultValue({ defaultValue: '0%' })).toBe(0);

    // none, and one which can't be read
    expect(defaultValue({})).toBeUndefined();
    expect(defaultValue({ defaultValue: 'high' })).toBeUndefined();
    expect(defaultValue({ defaultValue: 'high%' })).toBeUndefined();
  });

  it('reads the colors like Rocket Show', () => {
    expect(fixtureService.hexToRgb('#ff8000')).toEqual(jasmine.objectContaining({ red: 255, green: 128, blue: 0 }));
    expect(fixtureService.hexToRgb('#f80')).toEqual(jasmine.objectContaining({ red: 255, green: 136, blue: 0 }));
    expect(fixtureService.hexToRgb('FF8000')).toEqual(jasmine.objectContaining({ red: 255, green: 128, blue: 0 }));

    expect(fixtureService.hexToRgb('orange')).toBeNull();
    expect(fixtureService.hexToRgb('#ff80')).toBeNull();
  });

  it('leaves the colors out which it cannot read when it mixes them', () => {
    expect(fixtureService['mixHexColors'](['#ff0000', 'orange', '#0000ff'])).toEqual(
      jasmine.objectContaining({ red: 127.5, green: 0, blue: 127.5 })
    );
    expect(fixtureService['mixHexColors'](['orange'])).toBeUndefined();
  });

  function pixelGroups(groups: any): { [name: string]: FixtureMatrixPixelGroup } {
    return new FixtureMatrix({ pixelCount: [3, 1, 1], pixelGroups: groups }).pixelGroups;
  }

  it('takes the pixel groups in the order of the browser', () => {
    // the names of array indices come first and by their number, like Object.keys gives them
    const names = Object.keys(pixelGroups({ Master: 'all', '2': ['2'], '10': ['3'], '1': ['1'], '01': ['1'], Inner: ['2'] }));

    expect(names).toEqual(['1', '2', '10', 'Master', '01', 'Inner']);
  });

  it('reads the pixel groups of earlier designers', () => {
    const groups = pixelGroups({
      'wrapped all': { isAll: 'all', constraints: null },
      'wrapped keys': { isAll: false, constraints: ['1', '2'] },
      'wrapped twice': { isAll: { isAll: false, constraints: { x: ['<=2'] } }, constraints: null },
      'all flag': { isAll: true, constraints: null },
      'keys in an object': { x: [], keys: ['3'] },
      nothing: { isAll: false, constraints: null },
    });

    expect(groups['wrapped all'].isAll).toBe(true);
    expect(groups['wrapped keys'].constraints.keys).toEqual(['1', '2']);
    expect(groups['wrapped twice'].isAll).toBe(false);
    expect(groups['wrapped twice'].constraints.x).toEqual(['<=2']);
    expect(groups['all flag'].isAll).toBe(true);
    expect(groups['keys in an object'].constraints.keys).toEqual(['3']);

    // a group without a definition has no pixels
    expect(groups['nothing'].isAll).toBe(false);
    expect(groups['nothing'].constraints).toBeNull();
    expect(resolveService.resolveGroupPixels(groups['nothing'], [new CachedFixturePixel()])).toEqual([]);
  });

  function pixel(key: string, x: number): CachedFixturePixel {
    const cachedPixel = new CachedFixturePixel();
    cachedPixel.key = key;
    cachedPixel.x = x;
    return cachedPixel;
  }

  it('resolves the pixel groups like Rocket Show', () => {
    const pixels = [pixel('b', 1), pixel('a', 2), pixel('c', 3)];

    // a plain number is written without a sign
    const plus = pixelGroups({ group: { x: ['+2'] } })['group'];
    expect(() => resolveService.resolveGroupPixels(plus, pixels)).toThrow();

    // constraints by position keep the order of the pixels, only a name sorts them
    const positions = pixelGroups({ group: { x: ['>=1'], name: [] } })['group'];
    expect(resolveService.resolveGroupPixels(positions, pixels).map((groupPixel) => groupPixel.key)).toEqual(['b', 'a', 'c']);

    // only the digits 0 to 9 are numbers
    expect(FixturePixelGroupResolveService.compareKeys('2', '10')).toBeLessThan(0);
    expect(FixturePixelGroupResolveService.compareKeys('٢', '10')).toBeGreaterThan(0);
  });
});
