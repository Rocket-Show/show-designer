import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';

import { EffectCurve } from '../models/effect-curve';

import { Router } from '@angular/router';
import { Project } from '../models/project';
import { ConfigService } from './config.service';
import { EffectService } from './effect.service';
import { SceneService } from './scene.service';
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

// A project of version 1 named the fixtures of a preset only, ordered its presets and fixtures by
// the global lists, didn't know folders or steps: the migrations up to version 7 bring it to how a
// project is kept now, so it plays like it always did
describe('ProjectLoadService migrating a project of version 1', () => {
  let service: ProjectLoadService;
  let projectService: ProjectService;
  let warning: jasmine.Spy;

  beforeEach(() => {
    warning = jasmine.createSpy('show').and.returnValue(of(true));

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        BsModalService,
        { provide: WarningDialogService, useValue: { show: warning } },
      ],
    });

    service = TestBed.inject(ProjectLoadService);
    projectService = TestBed.inject(ProjectService);
  });

  function projectOfVersion1(): any {
    const project = projectWithSelectedPreset();
    delete project.version;
    delete project.presetFixtures;
    project.previewPreset = true;
    project.fixtureProfiles.push(pixelProfile('test/bar', [3, 1, 1]));
    project.fixtures.push(pixelFixture('bar-1', 'test/bar'));
    project.presets = [
      {
        uuid: 'b',
        name: 'B',
        folderUuid: 'old',
        fixtureUuids: ['bar-1', 'fixture-1', 'missing'],
        fixtureCapabilityValues: [{ type: 'Intensity', valuePercentage: 1 }],
      },
      { uuid: 'a', name: 'A', fixtureUuids: ['fixture-1'] },
    ];
    project.scenes = [{ uuid: 'scene', name: 'Scene', folderUuid: 'old', presetUuids: ['a', 'b'] }];
    project.compositions = [];
    project.selectedPresetUuid = 'b';

    return project;
  }

  function fixtureNames(presetFixtures: any[]): string[] {
    return presetFixtures.map((presetFixture) => presetFixture.fixtureUuid + (presetFixture.pixelKey ? '/' + presetFixture.pixelKey : ''));
  }

  it('lists the fixtures of the project and of its presets with their pixels', () => {
    service.import(JSON.stringify(projectOfVersion1()));
    const project = projectService.project;

    expect(project.version).toBe(projectService.currentProjectVersion);
    expect(fixtureNames(project.presetFixtures)).toEqual(['fixture-1', 'bar-1/1', 'bar-1/2', 'bar-1/3']);
    // in the order of the project (version 3), a fixture which is gone left out
    expect(fixtureNames(project.presets[0].fixtures)).toEqual(['fixture-1', 'bar-1/1', 'bar-1/2', 'bar-1/3']);
    expect(project.presets[0].useGlobalFixtureOrder).toBe(true);
    expect(project.presets[0].fixtureUuids).toBeUndefined();
  });

  it('layers the presets of a scene in the order of the project', () => {
    service.import(JSON.stringify(projectOfVersion1()));

    expect(projectService.project.scenes[0].presetUuids).toEqual(['b', 'a']);
  });

  it('opens it with the scenes, the presets and the fixtures at the top level, unsoloed', () => {
    service.import(JSON.stringify(projectOfVersion1()));
    const project = projectService.project;

    expect(project.previewPreset).toBe(false);
    expect(project.presets.map((preset) => [preset.folderUuid, preset.sortIndex])).toEqual([
      [undefined, 0],
      [undefined, 1],
    ]);
    expect(project.scenes[0].folderUuid).toBeUndefined();
    expect(project.presetFixtures.map((presetFixture) => presetFixture.sortIndex)).toEqual([0, 1, 2, 3]);
  });

  it('turns the values of a preset into its first step', () => {
    service.import(JSON.stringify(projectOfVersion1()));
    const preset = projectService.project.presets[0];

    expect(preset.steps.length).toBe(1);
    expect(preset.steps[0].fixtureCapabilityValues.map((value) => [value.type as string, value.valuePercentage])).toEqual([
      ['Intensity', 1],
    ]);
    expect(projectService.project.presets[1].steps.length).toBe(1);
  });

  it('tells that the project has been migrated', () => {
    service.import(JSON.stringify(projectOfVersion1()));
    expect(warning).toHaveBeenCalledWith('designer.project.migrated');

    warning.calls.reset();
    service.import(JSON.stringify(projectWithSelectedPreset()));
    expect(warning).not.toHaveBeenCalled();
  });
});

// Opening a project from the server, a new one, the template or an imported one, and putting a state
// of the project back after an undo
describe('ProjectLoadService opening projects', () => {
  let service: ProjectLoadService;
  let projectService: ProjectService;
  let presetService: PresetService;
  let navigate: jasmine.Spy;

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
    presetService = TestBed.inject(PresetService);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(TestBed.inject(BsModalService), 'show').and.returnValue({ hide: () => {} } as any);
  });

  it('opens a project of the server and names it in the address', () => {
    const saved = new Project({ ...projectWithSelectedPreset(), id: 7, shareToken: 'token' });
    spyOn(projectService, 'getProject').and.returnValue(of(saved));

    service.load(7, 'Imported').subscribe();

    expect(projectService.project).toBe(saved);
    expect(presetService.selectedPreset.uuid).toBe('preset-1');
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { id: 7, token: 'token' } }));
  });

  it('refuses a project of a newer designer', () => {
    spyOn(projectService, 'getProject').and.returnValue(of(new Project({ ...projectWithSelectedPreset(), version: 99 })));
    const failed = jasmine.createSpy('error');

    service.load(7, 'Newer').subscribe({ error: failed });

    expect(failed).toHaveBeenCalled();
    expect(failed.calls.mostRecent().args[0].message).toContain('newer version of the designer');
  });

  it('opens the template as a project of its own', () => {
    spyOn(projectService, 'getProject').and.returnValue(of(new Project({ ...projectWithSelectedPreset(), id: 1 })));

    service.template();

    expect(projectService.getProject).toHaveBeenCalledWith(1, null, undefined);
    expect(projectService.project.id).toBeUndefined();
    // the server gives it a token of its own once it is saved
    expect(projectService.project.shareToken).toBeUndefined();
    // a reload opens a new project from the template again, not the template itself
    expect(navigate.calls.mostRecent().args[1].queryParams).toEqual({ id: '', token: '' });
  });

  it('starts a new project with a preset played by a scene', () => {
    service.new();
    const project = projectService.project;

    expect(project.version).toBe(projectService.currentProjectVersion);
    expect(project.uuid).toBeTruthy();
    expect(project.shareToken).toBeTruthy();
    expect(project.presets.map((preset) => preset.name)).toEqual(['New Preset']);
    expect(project.scenes[0].presetUuids).toEqual([project.presets[0].uuid]);
    expect(presetService.selectedPreset).toBe(project.presets[0]);
    expect(TestBed.inject(SceneService).selectedScenes).toEqual([project.scenes[0]]);
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { id: '', token: '' } }));
  });

  it('imports a project as a new one', () => {
    service.import(JSON.stringify({ ...projectWithSelectedPreset(), id: 5 }));

    expect(projectService.project.id).toBeUndefined();
    expect(projectService.project.name).toBe('Imported');
  });

  it('puts the fixtures without a universe into the first one', () => {
    const configService = TestBed.inject(ConfigService);
    configService.universes = [{ uuid: 'first', name: 'First' } as any, { uuid: 'second', name: 'Second' } as any];
    const project = projectWithSelectedPreset();
    delete project.fixtures[0].dmxUniverseUuid;

    service.import(JSON.stringify(project));

    expect(projectService.project.fixtures[0].dmxUniverseUuid).toBe('first');
  });

  it('gives a project which keeps its own universes one, if it has none', () => {
    const configService = TestBed.inject(ConfigService);
    configService.freeUniverseEdit = true;
    const project = projectWithSelectedPreset();
    project.universes = [];

    service.import(JSON.stringify(project));

    expect(configService.universes.map((universe) => universe.name)).toEqual(['Universe 1']);
    expect(configService.universes).toBe(projectService.project.universes);
  });

  it('picks up what was being edited after a state of the project has been put back', () => {
    const data = projectWithSelectedPreset();
    data.presets[0].effects = [curveEffect('sine', 1)];
    service.import(JSON.stringify(data));

    const effectService = TestBed.inject(EffectService);
    const fixtureService = TestBed.inject(FixtureService);
    effectService.selectedEffect = presetService.selectedPreset.effects[0];
    fixtureService.selectedSettingsFixtures = [fixtureService.getFixtureByUuid('fixture-1')];

    const restored = new Project(JSON.parse(JSON.stringify(data)));
    service.restoreProject(restored);

    expect(projectService.project).toBe(restored);
    expect(presetService.selectedPreset).toBe(restored.presets[0]);
    expect(effectService.selectedEffect).toBe(restored.presets[0].effects[0]);
    expect(fixtureService.selectedSettingsFixtures).toEqual([restored.fixtures[0]]);
  });

  it('plays the first scene after an undo took the selected ones away', () => {
    const scenes = [{ uuid: 'scene', name: 'Scene', presetUuids: ['preset-1'] }];
    service.import(JSON.stringify({ ...projectWithSelectedPreset(), scenes, selectedSceneUuids: ['scene'] }));
    const restored = new Project({ ...projectWithSelectedPreset(), scenes, selectedSceneUuids: ['gone'] });

    service.restoreProject(restored);

    expect(TestBed.inject(SceneService).selectedScenes).toEqual([restored.scenes[0]]);
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
