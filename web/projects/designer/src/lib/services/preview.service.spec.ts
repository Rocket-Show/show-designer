import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { CachedFixture } from '../models/cached-fixture';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { PresetRegionScene } from '../models/preset-region-scene';
import { PresetStep } from '../models/preset-step';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { FixtureService } from './fixture.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';

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
