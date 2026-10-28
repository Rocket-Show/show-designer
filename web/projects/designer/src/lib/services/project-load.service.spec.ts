import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';

import { EffectCurve } from '../models/effect-curve';

import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { ProjectLoadService } from './project-load.service';
import { ProjectService } from './project.service';
import { WarningDialogService } from './warning-dialog.service';

// The panels of the selected preset look its fixtures up in the fixture cache as soon as
// they hear of a new step. An imported project brings fixtures of its own, so the cache
// has to hold them by then: a fixture the panels don't find makes them fail, which ends
// their subscription for the rest of the session.
describe('ProjectLoadService importing a project with fixtures new to the designer', () => {
  let service: ProjectLoadService;
  let fixtureService: FixtureService;
  let presetService: PresetService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), BsModalService],
    });

    service = TestBed.inject(ProjectLoadService);
    fixtureService = TestBed.inject(FixtureService);
    presetService = TestBed.inject(PresetService);
  });

  it('caches the fixtures of the project before it announces the selected step', () => {
    const found: boolean[] = [];

    presetService.stepsChanged.subscribe(() => {
      for (const presetFixture of presetService.selectedPreset?.fixtures || []) {
        found.push(!!fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey));
      }
    });

    service.import(JSON.stringify(projectWithSelectedPreset()));

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((isFound) => isFound)).toBe(true);
  });
});

// Until version 8, the curves except the square swung over half of their amplitude: the
// migration halves it, so a show looks the same as before
describe('ProjectLoadService migrating the curves of a project to version 8', () => {
  let service: ProjectLoadService;
  let projectService: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        BsModalService,
        { provide: WarningDialogService, useValue: { show: () => of(true) } },
      ],
    });

    service = TestBed.inject(ProjectLoadService);
    projectService = TestBed.inject(ProjectService);
  });

  it('halves the amplitude of every curve but the square', () => {
    const project = projectWithSelectedPreset();
    project.version = 7;
    project.presets[0].effects = [curveEffect('sine', 1), curveEffect('triangle', 0.8), curveEffect('square', 1)];

    service.import(JSON.stringify(project));

    const effects = projectService.project.presets[0].effects as EffectCurve[];
    expect(projectService.project.version).toBe(10);
    expect(effects.map((effect) => effect.amplitude)).toEqual([0.5, 0.4, 1]);
  });

  it('keeps the amplitude of a project of version 8', () => {
    const project = projectWithSelectedPreset();
    project.version = 8;
    project.presets[0].effects = [curveEffect('sine', 1)];

    service.import(JSON.stringify(project));

    expect((projectService.project.presets[0].effects[0] as EffectCurve).amplitude).toBe(1);
  });
});

// Until version 9, the pixels of a matrix given by its pixel count were named "Pixel 1-1-1"
// and so on. They are named like in the fixture library now: the migration renames them, so a
// preset still lights the same pixels.
describe('ProjectLoadService migrating the pixel keys of a project to version 9', () => {
  let service: ProjectLoadService;
  let projectService: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        BsModalService,
        { provide: WarningDialogService, useValue: { show: () => of(true) } },
      ],
    });

    service = TestBed.inject(ProjectLoadService);
    projectService = TestBed.inject(ProjectService);
  });

  // a bar of 12 pixels and a plane of 2 x 2, a preset of some of their pixels with a value on
  // the red channel of one of them and a curve on another one
  function projectWithPixels(version: number): any {
    const project = projectWithSelectedPreset();
    project.version = version;
    project.fixtureProfiles.push(pixelProfile('test/bar', [12, 1, 1]), pixelProfile('test/plane', [2, 2, 1]));
    project.fixtures.push(pixelFixture('bar-1', 'test/bar'), pixelFixture('plane-1', 'test/plane'));
    project.presetFixtures.push(
      { fixtureUuid: 'bar-1', pixelKey: 'Pixel 1-1-1' },
      { fixtureUuid: 'bar-1', pixelKey: 'Pixel 12-1-1' },
      { fixtureUuid: 'plane-1', pixelKey: 'Pixel 2-1-1' },
      { fixtureUuid: 'plane-1', pixelKey: 'Pixel 1-2-1' }
    );
    project.presets[0].fixtures.push(
      { fixtureUuid: 'bar-1', pixelKey: 'Pixel 12-1-1' },
      { fixtureUuid: 'plane-1', pixelKey: 'Pixel 1-2-1' }
    );
    project.presets[0].steps[0].fixtureChannelValues = [
      { channelName: 'Red Pixel 12-1-1', profileUuid: 'test/bar', value: 255 },
      { channelName: 'Red Pixel 1-1-1', profileUuid: 'test/bar', value: 128 },
    ];
    const curve = curveEffect('sine', 1);
    curve.channels = [{ profileUuid: 'test/plane', channels: ['Red Pixel 2-2-1'] }];
    project.presets[0].effects = [curve];
    return project;
  }

  it('names the pixels like the fixture library', () => {
    service.import(JSON.stringify(projectWithPixels(8)));

    const project = projectService.project;
    const preset = project.presets[0];
    expect(project.version).toBe(10);
    expect(project.presetFixtures.map((fixture) => fixture.pixelKey)).toEqual([undefined, '1', '12', '(2, 1)', '(1, 2)']);
    expect(preset.fixtures.map((fixture) => fixture.pixelKey)).toEqual([undefined, '12', '(1, 2)']);
    expect(preset.steps[0].fixtureChannelValues.map((value) => value.channelName)).toEqual(['Red 12', 'Red 1']);
    expect((preset.effects[0] as EffectCurve).channels[0].channels).toEqual(['Red (2, 2)']);
  });

  it('keeps the pixel keys of a project of version 9', () => {
    const project = projectWithPixels(9);

    service.import(JSON.stringify(project));

    expect(projectService.project.presetFixtures[1].pixelKey).toBe('Pixel 1-1-1');
  });

  it('keeps the channels of a curve when the project is loaded again', () => {
    service.import(JSON.stringify(projectWithPixels(9)));

    // saved and loaded again
    service.import(JSON.stringify(projectService.project));

    expect((projectService.project.presets[0].effects[0] as EffectCurve).channels[0].channels).toEqual(['Red Pixel 2-2-1']);
  });
});

// Until version 10, the timeline had one lane: all scenes were played on it, the first scene of
// the project on top where they overlapped. The migration gives every scene a track of its own,
// in the order of the scenes, so the show plays the same way.
describe('ProjectLoadService migrating the timeline of a project to version 10', () => {
  let service: ProjectLoadService;
  let projectService: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        BsModalService,
        { provide: WarningDialogService, useValue: { show: () => of(true) } },
      ],
    });

    service = TestBed.inject(ProjectLoadService);
    projectService = TestBed.inject(ProjectService);
  });

  // two scenes played over a song, the second one already when the first one starts
  function projectWithComposition(version: number): any {
    const project = projectWithSelectedPreset();
    project.version = version;
    project.scenes = [
      { uuid: 'scene-1', name: 'Chorus', presetUuids: ['preset-1'] },
      { uuid: 'scene-2', name: 'Background', presetUuids: ['preset-1'] },
    ];
    project.compositions = [
      {
        uuid: 'composition-1',
        name: 'Song',
        scenePlaybackRegions: [
          { sceneUuid: 'scene-2', startMillis: 0, endMillis: 60000 },
          { sceneUuid: 'scene-1', startMillis: 20000, endMillis: 40000 },
        ],
      },
    ];
    return project;
  }

  it('plays every scene on a track of its own, the first scene on top', () => {
    service.import(JSON.stringify(projectWithComposition(9)));

    const composition = projectService.project.compositions[0];
    expect(projectService.project.version).toBe(10);
    expect(composition.tracks.map((track) => track.name)).toEqual(['Chorus', 'Background']);
    expect(composition.scenePlaybackRegions.map((region) => region.trackUuid)).toEqual([
      composition.tracks[1].uuid,
      composition.tracks[0].uuid,
    ]);
  });

  it('keeps the tracks of a project of version 10', () => {
    const project = projectWithComposition(10);
    project.compositions[0].tracks = [
      { uuid: 'track-1', name: 'Background' },
      { uuid: 'track-2', name: 'Chorus' },
    ];
    project.compositions[0].scenePlaybackRegions[0].trackUuid = 'track-1';
    project.compositions[0].scenePlaybackRegions[1].trackUuid = 'track-2';

    service.import(JSON.stringify(project));

    const composition = projectService.project.compositions[0];
    expect(composition.tracks.map((track) => track.name)).toEqual(['Background', 'Chorus']);
    expect(composition.scenePlaybackRegions.map((region) => region.trackUuid)).toEqual(['track-1', 'track-2']);
  });
});

function pixelProfile(uuid: string, pixelCount: number[]): any {
  return {
    uuid,
    name: uuid,
    manufacturerShortName: 'test',
    manufacturerName: 'Test',
    categories: ['Pixel Bar'],
    matrix: { pixelCount },
    templateChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
    modes: [
      {
        name: 'Pixels',
        shortName: 'pixels',
        channels: [{ insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] }],
      },
    ],
  };
}

function pixelFixture(uuid: string, profileUuid: string): any {
  return {
    uuid,
    profileUuid,
    name: uuid,
    dmxUniverseUuid: 'universe-1',
    dmxFirstChannel: 10,
    modeShortName: 'pixels',
    positioning: 'topFront',
  };
}

function curveEffect(curveType: string, amplitude: number): any {
  return {
    type: 'curve',
    uuid: curveType,
    curveType,
    amplitude,
    position: 0.5,
    lengthMillis: 1000,
    phaseMillis: 0,
    phasingMillis: 0,
    capabilities: [],
    channels: [],
  };
}

// a project with one dimmer, which its selected preset turns on
function projectWithSelectedPreset(): any {
  return {
    version: 10,
    name: 'Imported',
    fixtureProfiles: [
      {
        uuid: 'test/dimmer',
        name: 'Dimmer',
        manufacturerShortName: 'test',
        manufacturerName: 'Test',
        categories: ['Dimmer'],
        availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
        modes: [{ name: '1-channel', shortName: '1ch', channels: ['Dimmer'] }],
      },
    ],
    fixtures: [
      {
        uuid: 'fixture-1',
        profileUuid: 'test/dimmer',
        name: 'Dimmer 1',
        dmxUniverseUuid: 'universe-1',
        dmxFirstChannel: 0,
        modeShortName: '1ch',
        positioning: 'topFront',
      },
    ],
    presetFixtures: [{ fixtureUuid: 'fixture-1', sortIndex: 0 }],
    universes: [{ uuid: 'universe-1', name: 'Universe 1' }],
    presets: [
      {
        uuid: 'preset-1',
        name: 'Full',
        fixtures: [{ fixtureUuid: 'fixture-1' }],
        steps: [{ uuid: 'step-1', startMillis: 0, fixtureCapabilityValues: [{ type: 'Intensity', valuePercentage: 1 }] }],
      },
    ],
    scenes: [],
    compositions: [],
    selectedPresetUuid: 'preset-1',
    selectedStepUuid: 'step-1',
  };
}
