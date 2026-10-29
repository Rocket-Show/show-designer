import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import * as THREE from 'three';

import { CachedFixture } from '../models/cached-fixture';
import { Composition } from '../models/composition';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { PresetRegionScene } from '../models/preset-region-scene';
import { PresetStep } from '../models/preset-step';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';

// how much of what a preset puts out reaches the stage. These mirror the cases of
// PresetIntensityTest in Rocket Show: a show has to look the same on stage as it
// did while it was written, so both sides run the same ones.
describe('PreviewService preset intensity', () => {
  let service: PreviewService;

  beforeEach(() => {
    // the intensity is worked out from the passed preset alone, so the service is built
    // without its dependencies rather than dragging the whole designer into the spec
    service = new PreviewService(undefined, undefined, undefined, undefined, undefined, undefined);
  });

  function scene(dimmer: number): Scene {
    const sceneWithDimmer = new Scene();
    sceneWithDimmer.dimmer = dimmer;

    return sceneWithDimmer;
  }

  function region(startMillis: number, endMillis: number): ScenePlaybackRegion {
    const playbackRegion = new ScenePlaybackRegion();
    playbackRegion.startMillis = startMillis;
    playbackRegion.endMillis = endMillis;

    return playbackRegion;
  }

  function intensity(preset: PresetRegionScene, timeMillis: number): number {
    return service['getPresetIntensity'](preset, timeMillis);
  }

  it('should let a scene at full through', () => {
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), scene(1));

    expect(intensity(playing, 5000)).toBe(1);
  });

  it('should scale a scene on the timeline by its dimmer', () => {
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), scene(0.25));

    expect(intensity(playing, 5000)).toBe(0.25);
  });

  it('should scale a scene by its dimmer while it is only being watched', () => {
    // a selected scene is previewed without a region: the dimmer still holds it down
    const previewed = new PresetRegionScene(new Preset(), undefined, scene(0.5));

    expect(intensity(previewed, 5000)).toBe(0.5);
  });

  it('should leave a preset played on its own alone', () => {
    const solo = new PresetRegionScene(new Preset(), undefined, undefined);

    expect(intensity(solo, 5000)).toBe(1);
  });

  it('should take the scene fade out of what the dimmer leaves', () => {
    const dimmed = scene(0.5);
    dimmed.fadeInMillis = 1000;
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), dimmed);

    // half way into the fade, half of the half the dimmer leaves is through
    expect(intensity(playing, 500)).toBeCloseTo(0.25, 10);
    // and the dimmer alone holds it once the fade is over
    expect(intensity(playing, 5000)).toBe(0.5);
  });

  it('should take the scene fade out over the whole fade, not only its end', () => {
    const dimmed = scene(0.5);
    dimmed.fadeOutMillis = 1000;
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), dimmed);

    expect(intensity(playing, 9500)).toBeCloseTo(0.25, 10);
  });

  it('should combine the scene dimmer with a preset fade', () => {
    const preset = new Preset();
    preset.fadeInMillis = 1000;
    const playing = new PresetRegionScene(preset, region(0, 10000), scene(0.5));

    expect(intensity(playing, 500)).toBeCloseTo(0.25, 10);
  });

  it('should fade a preset out with its scene, when the scene fades out past its clip', () => {
    const fading = scene(1);
    fading.fadeOutMillis = 2000;
    fading.fadeOutPost = true;
    const preset = new Preset();
    preset.fadeOutMillis = 1000;
    const playing = new PresetRegionScene(preset, region(0, 10000), fading);

    // without times of its own, the preset ends with the scene: both fade out together
    expect(intensity(playing, 10000)).toBe(1);
    expect(intensity(playing, 11500)).toBeCloseTo(0.25 * 0.5, 10);
  });

  it('should fade a preset in with its scene, when the scene fades in before its clip', () => {
    const fading = scene(1);
    fading.fadeInMillis = 2000;
    fading.fadeInPre = true;
    const preset = new Preset();
    preset.fadeInMillis = 1000;
    const playing = new PresetRegionScene(preset, region(5000, 10000), fading);

    expect(intensity(playing, 3500)).toBeCloseTo(0.25 * 0.5, 10);
    expect(intensity(playing, 5000)).toBe(1);
  });

  it('should shut a scene off at a dimmer of zero', () => {
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), scene(0));

    expect(intensity(playing, 5000)).toBe(0);
  });
});

// A fixture lighting in colors without a dimmer gets a virtual one, and a fading preset fades the
// dimmer of a fixture (its own or the virtual one), not its colors as well. These mirror the cases
// of DesignerDmxTest in Rocket Show, which sends what the preview shows.
describe('PreviewService dimmers and fades', () => {
  let fixtureService: FixtureService;
  let previewService: PreviewService;

  // an RGB par with a dimmer (par) and one without (rgb, like the ADJ Dotz Par in its 3-channel mode)
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixtureService = TestBed.inject(FixtureService);
    previewService = TestBed.inject(PreviewService);

    const colors = {
      Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
      Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
      Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
    };

    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        {
          uuid: 'test/rgb-par',
          name: 'RGB par',
          categories: ['Color Changer'],
          availableChannels: { Dimmer: { capability: { type: 'Intensity' } }, ...colors },
          modes: [{ name: '4-channel', shortName: '4ch', channels: ['Dimmer', 'Red', 'Green', 'Blue'] }],
        },
        {
          uuid: 'test/rgb',
          name: 'RGB par without dimmer',
          categories: ['Color Changer'],
          availableChannels: colors,
          modes: [{ name: '3-channel', shortName: '3ch', channels: ['Red', 'Green', 'Blue'] }],
        },
      ],
      fixtures: [
        { uuid: 'par', profileUuid: 'test/rgb-par', modeShortName: '4ch', dmxFirstChannel: 0, positioning: 'topFront' },
        { uuid: 'rgb', profileUuid: 'test/rgb', modeShortName: '3ch', dmxFirstChannel: 10, positioning: 'topFront' },
      ],
      presetFixtures: [{ fixtureUuid: 'par' }, { fixtureUuid: 'rgb' }],
    });
    fixtureService.updateCachedFixtures();
  });

  function capability(type: string, valuePercentage: number, color?: string): FixtureCapabilityValue {
    return new FixtureCapabilityValue({ type, valuePercentage, color });
  }

  function preset(fixtureUuid: string, capabilityValues: FixtureCapabilityValue[]): Preset {
    const fixturePreset = new Preset();
    const presetFixture = new PresetFixture();
    presetFixture.fixtureUuid = fixtureUuid;
    fixturePreset.fixtures = [presetFixture];

    const step = new PresetStep();
    step.fixtureCapabilityValues = capabilityValues;
    fixturePreset.steps = [step];

    return fixturePreset;
  }

  function scene(dimmer: number): Scene {
    const dimmedScene = new Scene();
    dimmedScene.dimmer = dimmer;
    return dimmedScene;
  }

  // the values of the fixture with the passed uuid, the presets from bottom to top
  function channelValues(fixtureUuid: string, presets: PresetRegionScene[]): { [channelName: string]: number } {
    const cachedFixture: CachedFixture = fixtureService.cachedFixtures.find((fixture) => fixture.fixture.uuid === fixtureUuid);
    const values = {};

    for (const value of previewService.getChannelValues(0, presets).get(cachedFixture)) {
      values[value.channelName] = value.value;
    }

    return values;
  }

  const virtualDimmer = FixtureService.virtualDimmerChannelName;

  it('gives a fixture without a dimmer a virtual one at full', () => {
    const values = channelValues('rgb', [
      new PresetRegionScene(preset('rgb', [capability('ColorIntensity', 1, 'Red')]), undefined, undefined),
    ]);

    expect(values[virtualDimmer]).toBe(255);
    expect(values['Red']).toBe(255);
  });

  it('dims a fixture without a dimmer with its virtual one', () => {
    const red = preset('rgb', [capability('Intensity', 0.5), capability('ColorIntensity', 1, 'Red')]);
    const values = channelValues('rgb', [new PresetRegionScene(red, undefined, undefined)]);

    expect(values[virtualDimmer]).toBeCloseTo(127.5, 5);
    expect(values['Red']).toBe(255);
  });

  it('gives a fixture with a dimmer no virtual one', () => {
    const values = channelValues('par', []);

    expect(values[virtualDimmer]).toBeUndefined();
  });

  it('fades a fixture with a dimmer in its dimmer only', () => {
    const red = preset('par', [capability('Intensity', 1), capability('ColorIntensity', 1, 'Red')]);
    const values = channelValues('par', [new PresetRegionScene(red, undefined, scene(0.3))]);

    // the light is at 30 %, not at 30 % of 30 %
    expect(values['Dimmer']).toBeCloseTo(76.5, 5);
    expect(values['Red']).toBe(255);
  });

  it('fades a fixture without a dimmer once', () => {
    const red = preset('rgb', [capability('Intensity', 1), capability('ColorIntensity', 1, 'Red')]);
    const values = channelValues('rgb', [new PresetRegionScene(red, undefined, scene(0.3))]);

    expect((values[virtualDimmer] / 255) * values['Red']).toBeCloseTo(76.5, 5);
  });

  it('blends the colors of a fading preset with the ones below', () => {
    const red = preset('par', [
      capability('Intensity', 1),
      capability('ColorIntensity', 1, 'Red'),
      capability('ColorIntensity', 0, 'Blue'),
    ]);
    const blue = preset('par', [
      capability('Intensity', 1),
      capability('ColorIntensity', 0, 'Red'),
      capability('ColorIntensity', 1, 'Blue'),
    ]);
    const values = channelValues('par', [
      new PresetRegionScene(red, undefined, undefined),
      new PresetRegionScene(blue, undefined, scene(0.5)),
    ]);

    expect(values['Dimmer']).toBe(255);
    expect(values['Red']).toBeCloseTo(127.5, 5);
    expect(values['Blue']).toBeCloseTo(127.5, 5);
  });

  it('keeps the color of a preset fading to dark', () => {
    const red = preset('par', [capability('Intensity', 1), capability('ColorIntensity', 1, 'Red')]);
    const dark = preset('par', [capability('Intensity', 0), capability('ColorIntensity', 1, 'Blue')]);
    const values = channelValues('par', [
      new PresetRegionScene(red, undefined, undefined),
      new PresetRegionScene(dark, undefined, scene(0.5)),
    ]);

    // half way to dark, still in red
    expect(values['Dimmer']).toBeCloseTo(127.5, 5);
    expect(values['Red']).toBe(255);
    expect(values['Blue']).toBe(0);
  });
});

// The place of each fixture in the chase of its preset. These mirror the chase cases of
// DesignerDmxTest in Rocket Show.
describe('PreviewService chases', () => {
  let presetService: PresetService;

  // two pars and a twin of the first one, patched on its address: the same lamp
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    presetService = TestBed.inject(PresetService);

    TestBed.inject(ProjectService).project = new Project({
      fixtures: [
        { uuid: 'par-1', dmxUniverseUuid: 'front', dmxFirstChannel: 0 },
        { uuid: 'par-1-twin', dmxUniverseUuid: 'front', dmxFirstChannel: 0 },
        { uuid: 'par-2', dmxUniverseUuid: 'front', dmxFirstChannel: 10 },
      ],
      presetFixtures: [{ fixtureUuid: 'par-1' }, { fixtureUuid: 'par-1-twin' }, { fixtureUuid: 'par-2' }],
    });
  });

  function preset(fixtureUuids: string[], useGlobalFixtureOrder = true): Preset {
    const chase = new Preset();
    chase.useGlobalFixtureOrder = useGlobalFixtureOrder;
    chase.fixtures = fixtureUuids.map((fixtureUuid) => new PresetFixture({ fixtureUuid }));

    return chase;
  }

  // the place in the chase of each of the passed fixtures
  function indices(chase: Preset, fixtureUuids: string[]): number[] {
    const fixtureIndices = presetService.getPresetFixtureIndices(chase);

    return fixtureUuids.map((fixtureUuid) => fixtureIndices.get(presetService.getPresetFixtureKey(fixtureUuid, undefined)));
  }

  it('chases in the fixture order of the project', () => {
    // par 1 comes first in the project, whatever the order of the preset
    expect(indices(preset(['par-2', 'par-1']), ['par-1', 'par-2'])).toEqual([0, 1]);
  });

  it('chases in the fixture order of the preset', () => {
    expect(indices(preset(['par-2', 'par-1'], false), ['par-1', 'par-2'])).toEqual([1, 0]);
  });

  it('chases fixtures on the same address in one step', () => {
    const chase = preset(['par-1', 'par-1-twin', 'par-2']);

    // par 2 is the second step of the chase, not the third one
    expect(indices(chase, ['par-1', 'par-1-twin', 'par-2'])).toEqual([0, 1, 1]);
    expect(presetService.getPresetFixtureCount(chase)).toBe(2);
  });

  it('leaves a fixture which is not in the preset out of its chase', () => {
    expect(indices(preset(['par-2']), ['par-1', 'par-2'])).toEqual([undefined, 0]);
  });

  it('keeps the pixels of a fixture apart', () => {
    const pixels = new Preset();
    pixels.fixtures = ['1', '2'].map((pixelKey) => new PresetFixture({ fixtureUuid: 'par-2', pixelKey }));
    TestBed.inject(ProjectService).project.presetFixtures.push(...pixels.fixtures.map((fixture) => new PresetFixture(fixture)));

    const fixtureIndices = presetService.getPresetFixtureIndices(pixels);

    expect(fixtureIndices.get(presetService.getPresetFixtureKey('par-2', '1'))).toBe(0);
    expect(fixtureIndices.get(presetService.getPresetFixtureKey('par-2', '2'))).toBe(1);
    expect(presetService.getPresetFixtureCount(pixels)).toBe(2);
  });
});

// What the preview shows where Rocket Show used to play it differently. These mirror the cases of
// DesignerDmxTest in Rocket Show ("read and played like the designer previews it"), on the same
// fixtures: an RGB par with a strobe opened by its default value and a moving head with 16 bit
// pan and tilt and a color wheel.
describe('PreviewService like Rocket Show plays it', () => {
  let fixtureService: FixtureService;
  let previewService: PreviewService;
  let projectService: ProjectService;

  function profiles(): any[] {
    return [
      {
        uuid: 'test/rgb-par',
        name: 'RGB par',
        categories: ['Color Changer'],
        availableChannels: {
          Dimmer: { capability: { type: 'Intensity' } },
          Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
          Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
          Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
          Strobe: {
            defaultValue: 5,
            capabilities: [
              { dmxRange: [0, 9], type: 'ShutterStrobe', shutterEffect: 'Open' },
              { dmxRange: [10, 255], type: 'ShutterStrobe', shutterEffect: 'Strobe' },
            ],
          },
        },
        modes: [{ name: '6-channel', shortName: '6ch', channels: ['Dimmer', 'Red', 'Green', 'Blue', null, 'Strobe'] }],
      },
      {
        uuid: 'test/moving-head',
        name: 'Moving head',
        categories: ['Moving Head'],
        availableChannels: {
          Pan: {
            fineChannelAliases: ['Pan fine'],
            defaultValue: '50%',
            capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' },
          },
          Tilt: {
            fineChannelAliases: ['Tilt fine'],
            defaultValue: '12.5%',
            capability: { type: 'Tilt', angleStart: '0deg', angleEnd: '270deg' },
          },
          Dimmer: { capability: { type: 'Intensity' } },
          'Color Wheel': {
            capabilities: [
              { dmxRange: [0, 9], type: 'WheelSlot', slotNumber: 1 },
              { dmxRange: [10, 19], type: 'WheelSlot', slotNumber: 2 },
              { dmxRange: [20, 29], type: 'WheelSlot', slotNumber: 3 },
            ],
          },
        },
        wheels: {
          'Color Wheel': { slots: [{ type: 'Open' }, { type: 'Color', colors: ['#ff0000'] }, { type: 'Color', colors: ['#0000ff'] }] },
        },
        modes: [{ name: '6-channel', shortName: '6ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Dimmer', 'Color Wheel'] }],
      },
    ];
  }

  function load(fixtureProfiles: any[] = profiles()) {
    projectService.project = new Project({
      fixtureProfiles,
      fixtures: [
        {
          uuid: 'par-1',
          profileUuid: 'test/rgb-par',
          modeShortName: '6ch',
          dmxUniverseUuid: 'front',
          dmxFirstChannel: 0,
          positioning: 'topFront',
        },
        {
          uuid: 'head',
          profileUuid: 'test/moving-head',
          modeShortName: '6ch',
          dmxUniverseUuid: 'back',
          dmxFirstChannel: 0,
          positioning: 'topFront',
        },
      ],
      presetFixtures: [{ fixtureUuid: 'par-1' }, { fixtureUuid: 'head' }],
    });
    fixtureService.updateCachedFixtures();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixtureService = TestBed.inject(FixtureService);
    previewService = TestBed.inject(PreviewService);
    projectService = TestBed.inject(ProjectService);
    load();
  });

  function preset(fixtures: any[], capabilityValues: any[]): Preset {
    return new Preset({ fixtures, steps: [{ fixtureCapabilityValues: capabilityValues }] });
  }

  function channelValues(fixtureUuid: string, presets: Preset[]): { [channelName: string]: number } {
    const cachedFixture: CachedFixture = fixtureService.cachedFixtures.find((fixture) => fixture.fixture.uuid === fixtureUuid);
    const values = {};
    const playing = presets.map((playingPreset) => new PresetRegionScene(playingPreset, undefined, undefined));

    for (const value of previewService.getChannelValues(0, playing).get(cachedFixture)) {
      values[value.channelName] = value.value;
    }

    return values;
  }

  const red = { type: 'ColorIntensity', color: 'Red', valuePercentage: 1 };
  const dimmer = { type: 'Intensity', valuePercentage: 1 };

  it('sends the default values like Rocket Show', () => {
    // a fraction of a percent of 16 bit, which the designer took 12 % of before
    const head = channelValues('head', []);
    expect(head['Pan']).toBe(65535 * 0.5);
    expect(head['Tilt']).toBe(65535 * 0.125);

    expect(channelValues('par-1', [])['Strobe']).toBe(5);
  });

  it('starts a channel at a default of 0', () => {
    const withZero = profiles();
    withZero[0].availableChannels.Strobe.defaultValue = 0;
    load(withZero);

    expect(channelValues('par-1', [])['Strobe']).toBe(0);
  });

  it('fades no scene without fade times', () => {
    const scene = new Scene({ uuid: 'scene' });
    const region = new ScenePlaybackRegion({ startMillis: 4900, endMillis: 60000 });

    // 100 ms into its clip, it's at full already (Rocket Show faded it in over two seconds)
    expect(previewService['getPresetIntensity'](new PresetRegionScene(new Preset(), region, scene), 5000)).toBe(1);
  });

  it('plays a project with a capability of a newer fixture library', () => {
    const newer = profiles();
    newer[0].availableChannels.Laser = { capability: { type: 'SomethingNew', color: 'Ultraviolet' } };
    load(newer);

    const values = channelValues('par-1', [preset([{ fixtureUuid: 'par-1' }], [dimmer, red])]);

    expect(values['Dimmer']).toBe(255);
    expect(values['Red']).toBe(255);
  });

  it('lights a fixture named with an empty pixel key', () => {
    const values = channelValues('par-1', [preset([{ fixtureUuid: 'par-1', pixelKey: '' }], [dimmer, red])]);

    expect(values['Red']).toBe(255);
  });

  it('leaves the wheel alone for a color without value', () => {
    const values = channelValues('head', [
      preset(
        [{ fixtureUuid: 'head' }],
        [
          dimmer,
          { type: 'ColorIntensity', color: 'Red' },
          { type: 'ColorIntensity', color: 'Green', valuePercentage: 0 },
          { type: 'ColorIntensity', color: 'Blue', valuePercentage: 1 },
        ]
      ),
    ]);

    expect(values['Dimmer']).toBe(255);
    expect(values['Color Wheel']).toBeUndefined();
  });

  it('plays a profile with a slot of a wheel it does not have', () => {
    // e.g. dts/xr4-spot in the fixture library: the channel is named differently than its wheel
    const renamed = profiles();
    renamed[1].availableChannels['Color Wheel Simple'] = renamed[1].availableChannels['Color Wheel'];
    delete renamed[1].availableChannels['Color Wheel'];
    renamed[1].modes[0].channels[5] = 'Color Wheel Simple';
    load(renamed);

    expect(channelValues('head', [preset([{ fixtureUuid: 'head' }], [dimmer])])['Dimmer']).toBe(255);
  });

  it('runs the curves on the tempo of the composition open in the designer', () => {
    const service = new PreviewService(undefined, undefined, undefined, undefined, { selectedComposition: undefined } as any, undefined);
    expect(service['getBeatsPerMinute']()).toBe(120);

    service['timelineService'].selectedComposition = new Composition({ beatsPerMinute: 60 });
    expect(service['getBeatsPerMinute']()).toBe(60);
  });
});

// The stage of the 3D preview, built from the sizes of the project.
// What the preview plays while nothing runs on the timeline: the selected preset on its own (soloed,
// or while no scene is selected), or else the presets of the selected scenes. And which step of the
// preset being edited it is on, for its list to mark and fill.
describe('PreviewService picking what to play', () => {
  let previewService: PreviewService;
  let presetService: PresetService;
  let sceneService: SceneService;
  let project: Project;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    previewService = TestBed.inject(PreviewService);
    presetService = TestBed.inject(PresetService);
    sceneService = TestBed.inject(SceneService);

    project = new Project({
      presets: [
        {
          uuid: 'a',
          steps: [
            { uuid: 'dark', startMillis: 0 },
            { uuid: 'bright', startMillis: 1000 },
          ],
        },
        { uuid: 'b', steps: [{ uuid: 'b-step' }] },
        { uuid: 'c', steps: [{ uuid: 'c-step' }] },
      ],
      scenes: [
        { uuid: 'first', presetUuids: ['a', 'b'] },
        { uuid: 'second', presetUuids: ['c'] },
      ],
    });
    TestBed.inject(ProjectService).project = project;
    presetService.selectedPreset = project.presets[2];
  });

  function played(): string[] {
    return previewService.getPresets(0).map((playing) => playing.preset.uuid + (playing.scene ? ' in ' + playing.scene.uuid : ''));
  }

  it('plays the selected preset on its own while it is soloed', () => {
    project.previewPreset = true;
    sceneService.selectedScenes = [project.scenes[0]];

    expect(played()).toEqual(['c']);
  });

  it('plays the selected preset on its own while no scene is selected', () => {
    project.previewPreset = false;
    sceneService.selectedScenes = [];

    expect(played()).toEqual(['c']);
  });

  it('plays nothing while neither a preset nor a scene is selected', () => {
    presetService.selectedPreset = undefined;
    sceneService.selectedScenes = [];

    expect(played()).toEqual([]);
  });

  it('plays the presets of the selected scenes, the first ones on top', () => {
    project.previewPreset = false;
    sceneService.selectedScenes = [project.scenes[1], project.scenes[0]];

    // from the bottom to the top
    expect(played()).toEqual(['c in second', 'b in first', 'a in first']);
  });

  function marked(playing: PresetRegionScene, timeMillis: number): [string, number] {
    previewService.getChannelValues(timeMillis, [playing]);

    return [presetService.activeStep?.uuid, presetService.activeStepProgress];
  }

  it('marks the step the selected preset is on while its steps run', () => {
    presetService.selectedPreset = project.presets[0];
    project.stepPreviewRunning = true;
    project.stepPreviewStartMillis = 500;

    expect(marked(new PresetRegionScene(project.presets[0], undefined, undefined), 2000)).toEqual(['bright', 0.5]);
  });

  it('marks the step the selected preset is on while it plays on the timeline', () => {
    presetService.selectedPreset = project.presets[0];
    const region = new ScenePlaybackRegion({ startMillis: 1000, endMillis: 10000 });

    expect(marked(new PresetRegionScene(project.presets[0], region, project.scenes[0]), 1500)).toEqual(['dark', 0.5]);
  });

  it('marks no step while the selected preset holds the step being edited', () => {
    presetService.selectedPreset = project.presets[0];

    expect(marked(new PresetRegionScene(project.presets[0], undefined, undefined), 1500)).toEqual([undefined, 0]);
  });

  it('marks no step of a preset which is not the selected one', () => {
    project.stepPreviewRunning = true;
    const region = new ScenePlaybackRegion({ startMillis: 0, endMillis: 10000 });

    expect(marked(new PresetRegionScene(project.presets[0], region, project.scenes[0]), 1500)).toEqual([undefined, 0]);
  });
});

describe('PreviewService building the stage', () => {
  let service: PreviewService;
  let project: Project;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    project = new Project({
      stageWidthCm: 800,
      stageHeightCm: 400,
      stageDepthCm: 500,
      stageFloorHeightCm: 50,
      stageCeilingHeightCm: 10,
      stagePillarWidthCm: 20,
    });
    TestBed.inject(ProjectService).project = project;
    service = TestBed.inject(PreviewService);
  });

  function boxes(): number[][] {
    return service.scene.children
      .filter((child) => child instanceof THREE.Mesh && (child as THREE.Mesh).geometry instanceof THREE.BoxGeometry)
      .map((child) => {
        const parameters = ((child as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
        return [parameters.width, parameters.height, parameters.depth, ...child.position.toArray()];
      });
  }

  it('builds nothing without a scene to show it in', () => {
    service.updateStage();

    expect(service.scene).toBeUndefined();
  });

  it('puts the floor, four pillars and the ceiling onto the ground', () => {
    service.scene = new THREE.Scene();

    service.updateStage();

    expect(service.scene.children.length).toBe(7);
    expect(boxes()).toEqual([
      [800, 50, 500, 0, 25, 0],
      [20, 400, 20, -390, 250, 240],
      [20, 400, 20, 390, 250, 240],
      [20, 400, 20, -390, 250, -240],
      [20, 400, 20, 390, 250, -240],
      [800, 10, 500, 0, 455, 0],
    ]);
    expect(service.scene.children.every((child) => !child.castShadow && !child.receiveShadow)).toBe(true);
  });

  it('builds the stage again with its new sizes', () => {
    service.scene = new THREE.Scene();
    service.updateStage();
    const old = service.scene.children[1] as THREE.Mesh;
    spyOn(old.geometry, 'dispose');

    project.stageWidthCm = 1000;
    service.updateStage();

    expect(service.scene.children.length).toBe(7);
    expect(service.scene.children).not.toContain(old);
    expect(old.geometry.dispose).toHaveBeenCalled();
    expect(boxes()[0][0]).toBe(1000);
  });

  it('builds a project without a stage of its own on the default stage', () => {
    const defaults = new Project();
    const loaded = new Project({ name: 'Old' });

    expect([
      loaded.stageWidthCm,
      loaded.stageHeightCm,
      loaded.stageDepthCm,
      loaded.stageFloorHeightCm,
      loaded.stageCeilingHeightCm,
      loaded.stagePillarWidthCm,
    ]).toEqual([
      defaults.stageWidthCm,
      defaults.stageHeightCm,
      defaults.stageDepthCm,
      defaults.stageFloorHeightCm,
      defaults.stageCeilingHeightCm,
      defaults.stagePillarWidthCm,
    ]);
    expect(loaded.selectedSceneUuids).toEqual([]);
  });

  it('marks the stage and the positions to be updated', () => {
    const fixtureSetup = jasmine.createSpy('fixtureSetup');
    service.doUpdateFixtureSetup.subscribe(fixtureSetup);

    service.stageAndPositionsDirty = false;
    service.doUpdateStageAndPositions.next();
    expect(service.stageAndPositionsDirty).toBe(true);

    service.stageAndPositionsDirty = false;
    service.updateFixtureSetup();
    expect(service.stageAndPositionsDirty).toBe(true);
    expect(fixtureSetup).toHaveBeenCalled();
  });

  it('highlights the fixtures of the presets edited', () => {
    const preset = new Preset({ uuid: 'p', fixtures: [{ fixtureUuid: 'f' }, { fixtureUuid: 'm', pixelKey: 'A1' }] });
    const presets = [new PresetRegionScene(preset, undefined, undefined)];

    expect(service.fixtureIsSelected('f', undefined, presets)).toBe(true);
    expect(service.fixtureIsSelected('m', 'A1', presets)).toBe(true);
    expect(service.fixtureIsSelected('m', 'A2', presets)).toBe(false);
    expect(service.fixtureIsSelected('other', undefined, presets)).toBe(false);
    expect(service.fixtureIsSelected('f', undefined, [])).toBe(false);
  });

  it('frees its materials', () => {
    const materials = [(service as any).fixtureMaterial, (service as any).fixtureSelectedMaterial];
    materials.forEach((material) => spyOn(material, 'dispose'));

    service.ngOnDestroy();

    expect(materials.map((material) => material.dispose.calls.count())).toEqual([1, 1]);
  });
});
