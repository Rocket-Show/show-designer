import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { profiles as libraryProfiles } from '../../../conformance/index';
import { CachedFixture } from '../models/cached-fixture';
import { EffectPixel } from '../models/effect-pixel';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { PresetRegionScene } from '../models/preset-region-scene';
import { Project } from '../models/project';
import { FixtureService } from './fixture.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';
import { TimelineService } from './timeline.service';

// The pixel effects in the preview: a pattern painted over the pixels of the bars and matrices of a preset, in the
// colors of a palette, blended with what the preset puts on them. Rocket Show plays them the same way, which the
// conformance cases check.
describe('PreviewService pixel effects', () => {
  let fixtureService: FixtureService;
  let previewService: PreviewService;

  // a matrix of 4 x 2 pixels, each of them red, green and blue
  const matrixProfile = {
    uuid: 'test/matrix',
    name: 'Matrix',
    categories: ['Matrix'],
    availableChannels: {},
    matrix: { pixelCount: [4, 2, 1] },
    templateChannels: {
      'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } },
      'Green $pixelKey': { capability: { type: 'ColorIntensity', color: 'Green' } },
      'Blue $pixelKey': { capability: { type: 'ColorIntensity', color: 'Blue' } },
    },
    modes: [
      {
        name: '24-channel',
        shortName: '24ch',
        channels: [
          {
            insert: 'matrixChannels',
            repeatFor: 'eachPixelXYZ',
            channelOrder: 'perPixel',
            templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'],
          },
        ],
      },
    ],
  };

  const profile = (name: string) => ({ ...JSON.parse(JSON.stringify(libraryProfiles[name])), uuid: name });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixtureService = TestBed.inject(FixtureService);
    previewService = TestBed.inject(PreviewService);

    // two bars of three pixels (the first in its 9-channel mode, the second with a dimmer of its own), a par, a matrix
    // and a COLORband PiX in its 9-channel mode, which lights its pixels in thirds
    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        profile('test/pixel-bar'),
        profile('test/rgb-par'),
        profile('chauvet-dj/colorband-pix'),
        profile('test/pixel-matrix'),
        profile('test/white-matrix'),
        profile('test/moving-head'),
        matrixProfile,
      ],
      fixtures: [
        { uuid: 'bar-1', profileUuid: 'test/pixel-bar', modeShortName: '9ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'bar-2', profileUuid: 'test/pixel-bar', modeShortName: '10ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
        { uuid: 'par', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 30 },
        { uuid: 'matrix', profileUuid: 'test/matrix', modeShortName: '24ch', dmxUniverseUuid: 'u', dmxFirstChannel: 40 },
        { uuid: 'band', profileUuid: 'chauvet-dj/colorband-pix', modeShortName: '9ch', dmxUniverseUuid: 'u', dmxFirstChannel: 70 },
        // a matrix of RGBW pixels
        { uuid: 'rgbw', profileUuid: 'test/pixel-matrix', modeShortName: '48ch', dmxUniverseUuid: 'u', dmxFirstChannel: 100 },
        // a matrix of 3 x 2 white LEDs, alone and with a master dimmer, and a moving head
        { uuid: 'white', profileUuid: 'test/white-matrix', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 160 },
        { uuid: 'white-master', profileUuid: 'test/white-matrix', modeShortName: '8ch', dmxUniverseUuid: 'u', dmxFirstChannel: 170 },
        { uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 180 },
      ],
      presetFixtures: [],
    });
    fixtureService.updateCachedFixtures();

    // every fixture and pixel, in the order of the project
    TestBed.inject(ProjectService).project.presetFixtures = fixtureService.cachedFixtures.map(
      (cachedFixture) => new PresetFixture({ fixtureUuid: cachedFixture.fixture.uuid, pixelKey: cachedFixture.pixel?.key })
    );
  });

  // the fixtures and pixels of the passed fixtures, for a preset
  function fixturesOf(...fixtureUuids: string[]): any[] {
    return fixtureService.cachedFixtures
      .filter((cachedFixture) => fixtureUuids.indexOf(cachedFixture.fixture.uuid) >= 0)
      .map((cachedFixture) => ({ fixtureUuid: cachedFixture.fixture.uuid, pixelKey: cachedFixture.pixel?.key }));
  }

  function pixelEffect(settings: any = {}): any {
    return {
      type: 'pixel',
      uuid: 'pixel',
      pattern: 'chase',
      size: 0.34,
      softness: 0,
      lengthMillis: 3000,
      palette: { stops: [{ position: 0, color: '#ff0000' }] },
      ...settings,
    };
  }

  function presetWith(fixtureUuids: string[], effect: any, capabilityValues: any[] = [], extra: any = {}): Preset {
    return new Preset({
      uuid: 'preset',
      fixtures: fixturesOf(...fixtureUuids),
      steps: [{ uuid: 'step', fixtureCapabilityValues: capabilityValues }],
      effects: [effect],
      ...extra,
    });
  }

  // red, green and blue of a part of a fixture (its pixel or itself) at a moment, from 0 to 255
  function colorOf(fixtureUuid: string, pixelKey: string, preset: Preset, timeMillis: number): number[] {
    const cachedFixture: CachedFixture = fixtureService.cachedFixtures.find(
      (candidate) => candidate.fixture.uuid === fixtureUuid && (candidate.pixel?.key ?? undefined) === pixelKey
    );
    const values = previewService.getChannelValues(timeMillis, [new PresetRegionScene(preset, undefined, undefined)]).get(cachedFixture);
    const component = (color: string) =>
      Math.round(values.find((value) => value.channelName === (pixelKey ? `${color} ${pixelKey}` : color))?.value ?? 0);

    return [component('Red'), component('Green'), component('Blue')];
  }

  // the value of a channel of a part of a fixture (its pixel or itself) at a moment
  function valueOf(fixtureUuid: string, pixelKey: string, channelName: string, preset: Preset, timeMillis: number): number {
    const cachedFixture: CachedFixture = fixtureService.cachedFixtures.find(
      (candidate) => candidate.fixture.uuid === fixtureUuid && (candidate.pixel?.key ?? undefined) === pixelKey
    );
    const values = previewService.getChannelValues(timeMillis, [new PresetRegionScene(preset, undefined, undefined)]).get(cachedFixture);

    return values.find((value) => value.channelName === channelName)?.value ?? 0;
  }

  // the dimmers of the white LEDs of a matrix at a moment, row by row, from 0 to 255
  function whiteDimmersOf(fixtureUuid: string, preset: Preset, timeMillis: number): number[] {
    return ['1', '2', '3', '4', '5', '6'].map((pixelKey) =>
      Math.round(valueOf(fixtureUuid, pixelKey, 'Dimmer LED ' + pixelKey, preset, timeMillis))
    );
  }

  const presetColor = [
    { type: 'ColorIntensity', color: 'Red', valuePercentage: 0.2 },
    { type: 'ColorIntensity', color: 'Green', valuePercentage: 1 },
  ];

  it('paints a pattern over the pixels of a bar in the colors of its palette', () => {
    const chase = presetWith(['bar-1'], pixelEffect());

    // halfway through its period, the block of a third of the bar is on its middle pixel
    expect(colorOf('bar-1', '2', chase, 1500)).toEqual([255, 0, 0]);
    expect(colorOf('bar-1', '1', chase, 1500)).toEqual([0, 0, 0]);
    expect(colorOf('bar-1', '3', chase, 1500)).toEqual([0, 0, 0]);
    // and then on the last one
    expect(colorOf('bar-1', '3', chase, 2246)).toEqual([255, 0, 0]);
    expect(colorOf('bar-1', '2', chase, 2246)).toEqual([0, 0, 0]);
  });

  it('chases from one fixture to the next, a fixture with all of its pixels taking one step', () => {
    const flow = presetWith(
      ['bar-1', 'bar-2'],
      pixelEffect({
        pattern: 'flow',
        palette: {
          stops: [
            { position: 0, color: '#000000' },
            { position: 1, color: '#ffffff' },
          ],
        },
        phasingMode: 'spread',
        phasingCycles: 1,
      })
    );

    // two steps: the second bar runs half a period behind the first one
    expect(colorOf('bar-2', '2', flow, 2000)).toEqual(colorOf('bar-1', '2', flow, 500));
    expect(colorOf('bar-2', '2', flow, 2000)).not.toEqual(colorOf('bar-1', '2', flow, 2000));
  });

  it('replaces the color of the preset, masks it, adds to it or takes the brightest of both', () => {
    const lit = (blend: string) => colorOf('bar-1', '2', presetWith(['bar-1'], pixelEffect({ blend }), presetColor), 1500);
    const dark = (blend: string) => colorOf('bar-1', '3', presetWith(['bar-1'], pixelEffect({ blend }), presetColor), 1500);

    expect([lit('replace'), dark('replace')]).toEqual([
      [255, 0, 0],
      [0, 0, 0],
    ]);
    expect([lit('mask'), dark('mask')]).toEqual([
      [51, 255, 0],
      [0, 0, 0],
    ]);
    expect([lit('add'), dark('add')]).toEqual([
      [255, 255, 0],
      [51, 255, 0],
    ]);
    expect([lit('max'), dark('max')]).toEqual([
      [255, 255, 0],
      [51, 255, 0],
    ]);
  });

  it('paints in the shades of the color of the preset, unless it has a palette of its own', () => {
    const shades = presetWith(['bar-1'], pixelEffect({ pattern: 'flow', size: 0, palette: { ref: 'preset' } }), [
      { type: 'ColorIntensity', color: 'Blue', valuePercentage: 1 },
    ]);
    const colors = ['1', '2', '3'].map((pixelKey) => colorOf('bar-1', pixelKey, shades, 700));

    // from the blue itself towards white
    expect(colors.every(([red, green, blue]) => red === green && blue === 255)).toBe(true);
    expect(new Set(colors.map((color) => color[0])).size).toBe(3);
    expect(new EffectPixel().palette.ref).toBe('preset');
  });

  it('leaves the dimmer of a bar to the preset', () => {
    const preset = presetWith(['bar-2'], pixelEffect(), [{ type: 'Intensity', valuePercentage: 0.5 }]);
    const general = fixtureService.cachedFixtures.find((cachedFixture) => cachedFixture.fixture.uuid === 'bar-2' && !cachedFixture.pixel);
    const values = previewService.getChannelValues(500, [new PresetRegionScene(preset, undefined, undefined)]).get(general);

    expect(values.find((value) => value.channelName === 'Dimmer').value).toBe(127.5);
    expect(colorOf('bar-2', '2', preset, 1500)).toEqual([255, 0, 0]);
  });

  it('lights a fixture without pixels as a single pixel, softly as the block passes it', () => {
    const chase = presetWith(['par'], pixelEffect());

    expect(colorOf('par', undefined, chase, 1500)[0]).toBeGreaterThan(150);
    expect(colorOf('par', undefined, chase, 100)[0]).toBeLessThan(10);
    expect(colorOf('par', undefined, chase, 1500)[1]).toBe(0);
  });

  it('runs through the pixels of a matrix', () => {
    const chase = presetWith(['matrix'], pixelEffect({ size: 0.5, direction: 'down' }));

    // half of the matrix high, a third into its period: its first row only
    expect(colorOf('matrix', '(3, 1)', chase, 1000)).toEqual([255, 0, 0]);
    expect(colorOf('matrix', '(3, 2)', chase, 1000)).toEqual([0, 0, 0]);
  });

  it('mirrors the pattern in the middle of each fixture', () => {
    const mirrored = presetWith(['matrix'], pixelEffect({ size: 0.25, mirror: true }));

    // the block runs in from both ends at once
    expect(colorOf('matrix', '(1, 1)', mirrored, 900)).toEqual([255, 0, 0]);
    expect(colorOf('matrix', '(4, 1)', mirrored, 900)).toEqual([255, 0, 0]);
    expect(colorOf('matrix', '(2, 1)', mirrored, 900)).toEqual([0, 0, 0]);
  });

  it('holds what it showed at the end of its run, or leaves the pixels to the preset', () => {
    const run = (endMode: string) =>
      presetWith(['bar-1'], pixelEffect({ runMode: 'duration', runDurationMillis: 1500, endMode }), presetColor);

    // it runs for half its period, then stops with the block on the middle pixel. Played on its own, the preview
    // repeats its run of 1875 ms: 1700 ms into it, it is past its end.
    expect(colorOf('bar-1', '2', run('hold'), 1700)).toEqual([255, 0, 0]);
    expect(colorOf('bar-1', '2', run('base'), 1700)).toEqual([51, 255, 0]);
  });

  it('fades with the preset and is closed by a step', () => {
    const closed = presetWith(['bar-1'], pixelEffect(), presetColor);
    closed.steps[0].effectAmounts = [{ effectUuid: 'pixel', amount: 0 } as any];
    const hidden = presetWith(['bar-1'], { ...pixelEffect(), visible: false }, presetColor);

    expect(colorOf('bar-1', '2', closed, 1500)).toEqual([51, 255, 0]);
    expect(colorOf('bar-1', '2', hidden, 1500)).toEqual([51, 255, 0]);
  });

  it('leaves the pixels dark for a pattern of a newer designer', () => {
    expect(colorOf('bar-1', '2', presetWith(['bar-1'], pixelEffect({ pattern: 'fireworks' })), 1500)).toEqual([0, 0, 0]);
  });

  it('spreads one picture across the fixtures of the preset, as they hang on the stage', () => {
    // how red the first or the last pixel of each of the two bars hanging side by side is
    const reds = (spread: string, pixelKey: string, timeMillis: number) => {
      const preset = presetWith(['bar-1', 'bar-2'], pixelEffect({ size: 0.3, spread }));

      return [colorOf('bar-1', pixelKey, preset, timeMillis)[0], colorOf('bar-2', pixelKey, preset, timeMillis)[0]];
    };

    // a block of a third of the picture at its left end: on the first bar only
    const [first, second] = reds('stage', '1', 300);
    expect(first).toBeGreaterThan(200);
    expect(second).toBe(0);

    // each bar on its own has the block at its own start
    const [own, alsoOwn] = reds('fixture', '1', 300);
    expect(own).toBeGreaterThan(0);
    expect(alsoOwn).toBe(own);

    // and later at the right end of the picture, the far end of the second bar
    const [firstEnd, secondEnd] = reds('stage', '3', 2700);
    expect(firstEnd).toBe(0);
    expect(secondEnd).toBeGreaterThan(200);
  });

  it('follows the fixtures moved on the stage and the parts made anew, spread across the stage', () => {
    const project = TestBed.inject(ProjectService).project;
    const preset = presetWith(['bar-1', 'bar-2'], pixelEffect({ size: 0.3, spread: 'stage' }));
    const firstPixels = () => [colorOf('bar-1', '1', preset, 300)[0], colorOf('bar-2', '1', preset, 300)[0]];

    // the block at the left end of the picture: on the first bar
    expect(firstPixels()[0]).toBeGreaterThan(200);
    expect(firstPixels()[1]).toBe(0);

    // the second bar put before the first one in the project: it hangs left of it now
    const secondBar = project.presetFixtures.filter((presetFixture) => presetFixture.fixtureUuid === 'bar-2');
    project.presetFixtures = [...secondBar, ...project.presetFixtures.filter((presetFixture) => presetFixture.fixtureUuid !== 'bar-2')];

    expect(firstPixels()[0]).toBe(0);
    expect(firstPixels()[1]).toBeGreaterThan(200);

    // the parts made anew, the same picture
    fixtureService.updateCachedFixtures();
    expect(firstPixels()[1]).toBeGreaterThan(200);

    // the first bar put on its own place on the stage, far to the right
    const firstBar = project.fixtures.find((candidate) => candidate.uuid === 'bar-1');
    firstBar.positioning = 'manual' as any;
    firstBar.positionX = 2000;
    firstBar.positionY = 300;
    expect(firstPixels()[0]).toBe(0);
    expect(firstPixels()[1]).toBeGreaterThan(200);
    firstBar.positionX = -2000;
    expect(firstPixels()[0]).toBeGreaterThan(200);
  });

  it('lights the white part of the light with the white LED of a pixel, if it is to', () => {
    // the values of the first pixel of the RGBW matrix, from 0 to 255
    const valuesOf = (effect: any) => {
      const preset = presetWith(['rgbw'], effect, [{ type: 'ColorIntensity', color: 'White', valuePercentage: 0.4 }]);
      const cachedFixture = fixtureService.cachedFixtures.find(
        (candidate) => candidate.fixture.uuid === 'rgbw' && candidate.pixel?.key === '1'
      );
      const values = previewService.getChannelValues(0, [new PresetRegionScene(preset, undefined, undefined)]).get(cachedFixture);

      return ['Red 1', 'Green 1', 'Blue 1', 'White 1'].map((name) =>
        Math.round(values.find((value) => value.channelName === name)?.value ?? 0)
      );
    };
    const light = (color: string, extra: any = {}) =>
      pixelEffect({ pattern: 'flow', palette: { stops: [{ position: 0, color }] }, ...extra });

    // white on the white LED, the rest on red, green and blue
    expect(valuesOf(light('#ffffff', { whiteLed: true }))).toEqual([0, 0, 0, 255]);
    expect(valuesOf(light('#ff8040', { whiteLed: true }))).toEqual([191, 64, 0, 64]);
    // without, the white LED keeps what the preset puts on it
    expect(valuesOf(light('#ffffff'))).toEqual([255, 255, 255, 102]);
    // added to what the preset puts on it
    expect(valuesOf(light('#ffffff', { whiteLed: true, blend: 'add' }))).toEqual([0, 0, 0, 255]);
  });

  it('follows the audio of the composition with its brightness or its size', () => {
    // loud from the start, silent from a second on
    previewService.audioFrames = (index: number) => new Array(21).fill(index < 50 ? 0 : -100);
    const flow = (extra: any) =>
      presetWith(
        ['bar-1'],
        pixelEffect({ pattern: 'flow', audioSource: 'composition', audioAttackMillis: 0, audioReleaseMillis: 0, ...extra })
      );

    expect(colorOf('bar-1', '2', flow({}), 500)).toEqual([255, 0, 0]);
    expect(colorOf('bar-1', '2', flow({}), 1500)).toEqual([0, 0, 0]);
    // its size: as loud as it gets, as large as without the audio, silent of no size (the flow runs longer then)
    const gradient = {
      palette: {
        stops: [
          { position: 0, color: '#000000' },
          { position: 1, color: '#ffffff' },
        ],
      },
    };
    const sized = flow({ audioFollows: 'size', ...gradient });
    const unsized = flow({ audioSource: 'off', ...gradient });
    expect(colorOf('bar-1', '3', sized, 500)).toEqual(colorOf('bar-1', '3', unsized, 500));
    expect(colorOf('bar-1', '3', sized, 1500)).not.toEqual(colorOf('bar-1', '3', unsized, 1500));
    // none without following it
    expect(colorOf('bar-1', '2', flow({ audioSource: 'off' }), 1500)).toEqual([255, 0, 0]);
    previewService.audioFrames = undefined;
  });

  it('fills a level meter up to how loud the audio is', () => {
    // a bar of three pixels, half way up
    previewService.audioFrames = () => new Array(21).fill(-30);
    const meter = presetWith(['bar-1'], pixelEffect({ pattern: 'meter', audioSource: 'composition', audioAttackMillis: 0 }));

    expect([colorOf('bar-1', '1', meter, 1000)[0], colorOf('bar-1', '3', meter, 1000)[0]]).toEqual([255, 0]);
    previewService.audioFrames = undefined;
  });

  it('follows a beat while the timeline does not play a composition', () => {
    const beat = presetWith(
      ['bar-1'],
      pixelEffect({ pattern: 'meter', audioSource: 'composition', audioAttackMillis: 0, audioReleaseMillis: 0 })
    );

    // the kick on the beat fills the bar, before the next one it has faded
    expect(colorOf('bar-1', '1', beat, 1000)[0]).toBe(255);
    expect(colorOf('bar-1', '3', beat, 1000)[0]).toBeGreaterThan(colorOf('bar-1', '3', beat, 1440)[0]);
  });

  it('follows the audio of the buses it picked while the composition plays', () => {
    const timelineService = TestBed.inject(TimelineService);
    const framesFor = spyOn(timelineService, 'audioFramesFor').and.callFake((buses: string[]) =>
      buses.includes('drums') ? () => new Array(21).fill(0) : undefined
    );
    const meter = (audioBuses: string[]) =>
      presetWith(['bar-1'], pixelEffect({ pattern: 'meter', audioSource: 'composition', audioAttackMillis: 0, audioBuses }));

    timelineService.playState = 'playing';

    // the drums at full scale fill the bar
    expect(colorOf('bar-1', '3', meter(['drums']), 1000)[0]).toBe(255);
    expect(framesFor).toHaveBeenCalledWith(['drums']);
    // buses not analyzed yet follow the beat meanwhile
    expect(colorOf('bar-1', '1', meter(['click']), 1000)[0]).toBe(255);
    expect(colorOf('bar-1', '3', meter(['click']), 1440)[0]).toBeLessThan(255);
    timelineService.playState = 'paused';
  });

  it('lights the white LEDs of a matrix on their dimmers, as bright as the color, dimmed by the preset', () => {
    const half = [{ type: 'Intensity', valuePercentage: 0.5 }];

    // halfway through its period, the block of a third of the matrix is on its middle column
    expect(whiteDimmersOf('white', presetWith(['white'], pixelEffect(), half), 1500)).toEqual([0, 128, 0, 0, 128, 0]);
    expect(whiteDimmersOf('white', presetWith(['white'], pixelEffect(), [{ type: 'Intensity', valuePercentage: 1 }]), 1500)).toEqual([
      0, 255, 0, 0, 255, 0,
    ]);

    // as bright as the brightest of the red, green and blue of a color
    const gray = presetWith(['white'], pixelEffect({ palette: { stops: [{ position: 0, color: '#408020' }] } }), half);
    expect(whiteDimmersOf('white', gray, 1500)[1]).toBe(64);

    // white at full in the shades of the color of the preset, whatever its color
    const shades = presetWith(['white'], pixelEffect({ palette: { ref: 'preset' } }), [...half, ...presetColor]);
    expect(whiteDimmersOf('white', shades, 1500)).toEqual([0, 128, 0, 0, 128, 0]);
  });

  it('masks the white of the preset, and adds to it or takes the brightest of both, which is all of it', () => {
    const half = [{ type: 'Intensity', valuePercentage: 0.5 }];
    const gray = (blend: string) =>
      whiteDimmersOf(
        'white',
        presetWith(['white'], pixelEffect({ blend, palette: { stops: [{ position: 0, color: '#808080' }] } }), half),
        1500
      );

    expect(gray('replace')).toEqual([0, 64, 0, 0, 64, 0]);
    expect(gray('mask')).toEqual([0, 128, 0, 0, 128, 0]);
    expect(gray('add')).toEqual([128, 128, 128, 128, 128, 128]);
    expect(gray('max')).toEqual([128, 128, 128, 128, 128, 128]);
  });

  it('leaves the white LEDs dark while the preset dims them to 0 or leaves their dimmer alone', () => {
    expect(whiteDimmersOf('white', presetWith(['white'], pixelEffect(), [{ type: 'Intensity', valuePercentage: 0 }]), 1500)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(whiteDimmersOf('white', presetWith(['white'], pixelEffect(), presetColor), 1500)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('leaves the master dimmer of a matrix of white LEDs and the dimmer of a fixture without pixels to the preset', () => {
    const preset = presetWith(['white-master', 'head'], pixelEffect(), [{ type: 'Intensity', valuePercentage: 0.5 }]);

    expect(valueOf('white-master', undefined, 'Master Dimmer', preset, 1500)).toBe(127.5);
    expect(whiteDimmersOf('white-master', preset, 1500)).toEqual([0, 128, 0, 0, 128, 0]);

    // the moving head as the preset dims it without the effect
    const hidden = presetWith(['white-master', 'head'], { ...pixelEffect(), visible: false }, [
      { type: 'Intensity', valuePercentage: 0.5 },
    ]);
    const dimmed = valueOf('head', undefined, 'Dimmer', hidden, 1500);
    expect(dimmed).toBeGreaterThan(0);
    expect(valueOf('head', undefined, 'Dimmer', preset, 100)).toBe(dimmed);
    expect(valueOf('head', undefined, 'Dimmer', preset, 1500)).toBe(dimmed);
  });

  it('fades the white LEDs back to the preset as a step closes the effect', () => {
    const preset = presetWith(['white'], pixelEffect(), [{ type: 'Intensity', valuePercentage: 1 }]);
    preset.steps[0].effectAmounts = [{ effectUuid: 'pixel', amount: 0.5 } as any];

    // halfway between the effect and the white at full of the preset
    expect(whiteDimmersOf('white', preset, 1500)).toEqual([128, 255, 128, 128, 255, 128]);
  });

  it('spreads one picture across the white LEDs and the pixels lighting in colors, as they hang on the stage', () => {
    const preset = presetWith(['bar-1', 'white'], pixelEffect({ size: 0.3, spread: 'stage' }), [{ type: 'Intensity', valuePercentage: 1 }]);
    const regionScene = new PresetRegionScene(preset, undefined, undefined);
    previewService.getChannelValues(0, [regionScene]);
    const partOf = (fixtureUuid: string, pixelKey: string) =>
      fixtureService.cachedFixtures.find((candidate) => candidate.fixture.uuid === fixtureUuid && candidate.pixel?.key === pixelKey);
    const stagePlace = (fixtureUuid: string, pixelKey: string) =>
      (previewService as any).getStagePixelPlace(preset, 'front', partOf(fixtureUuid, pixelKey));

    // the white LEDs have their places in the picture, which the pixels of the bar share with them
    const first = stagePlace('white', '1');
    expect(first).not.toBe(fixtureService.getPixelPlace(partOf('white', '1')));
    expect(stagePlace('white', '3').x).toBeGreaterThan(first.x);
    expect(stagePlace('bar-1', '1').columns).toBe(first.columns);
  });

  it('places a pixel in its column and row, and a group of pixels in the middle of them', () => {
    const place = (fixtureUuid: string, pixelKey: string) => {
      const cachedFixture = fixtureService.cachedFixtures.find(
        (candidate) => candidate.fixture.uuid === fixtureUuid && candidate.pixel?.key === pixelKey
      );
      const { x, y, column, row, columns, rows, aspectX, aspectY } = fixtureService.getPixelPlace(cachedFixture);
      return { x, y, column, row, columns, rows, aspectX, aspectY };
    };

    expect(place('matrix', '(3, 2)')).toEqual({ x: 0.625, y: 0.75, column: 2, row: 1, columns: 4, rows: 2, aspectX: 1, aspectY: 0.5 });
    // the first third of the band: its pixels 1 to 4
    expect(place('band', '1/3')).toEqual({ x: 2 / 12, y: 0.5, column: 1, row: 0, columns: 12, rows: 1, aspectX: 1, aspectY: 1 / 12 });
  });
});
