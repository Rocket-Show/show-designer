import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../conformance/index';
import { FakeEngine } from '../engine/fake-engine.spec';
import { CompileCode } from '../engine/lighting-engine';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { ConfigService } from './config.service';
import { DmxService } from './dmx.service';
import { EnginePreviewService } from './engine-preview.service';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';

describe('EnginePreviewService', () => {
  let fake: FakeEngine;
  let service: EnginePreviewService;
  let configService: ConfigService;
  let projectService: ProjectService;
  let fixtureService: FixtureService;
  let presetService: PresetService;
  let sceneService: SceneService;
  let timelineService: TimelineService;
  let previewService: PreviewService;
  let project: Project;

  // a par (6 channels) and a bar of three pixels (10 channels), on two universes
  function newProject(): Project {
    return new Project({
      version: 11,
      fixtureProfiles: [
        { ...JSON.parse(JSON.stringify(profiles['test/rgb-par'])), uuid: 'test/rgb-par' },
        { ...JSON.parse(JSON.stringify(profiles['test/pixel-bar'])), uuid: 'test/pixel-bar' },
      ],
      fixtures: [
        { uuid: 'par', name: 'Par', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'bar', name: 'Bar', profileUuid: 'test/pixel-bar', modeShortName: '10ch', dmxUniverseUuid: 'v', dmxFirstChannel: 0 },
      ],
      presetFixtures: [{ fixtureUuid: 'par' }, { fixtureUuid: 'bar' }],
      presets: [{ uuid: 'look', name: 'Look', fixtures: [{ fixtureUuid: 'par' }], steps: [{ uuid: 'look-1' }, { uuid: 'look-2' }] }],
      scenes: [
        { uuid: 'scene-1', name: 'One', presetUuids: ['look'] },
        { uuid: 'scene-2', name: 'Two', presetUuids: [] },
      ],
      compositions: [{ uuid: 'song', name: 'Song' }],
      masterDimmerValue: 0.5,
    });
  }

  // the index the compiler would make: every part of the designer with its channels, in their order
  function indexOf(): any {
    const parts = fixtureService.cachedFixtures.map((cachedFixture) => ({
      fixture: cachedFixture.fixture.uuid === 'par' ? 0 : 1,
      pixelKey: cachedFixture.pixel ? cachedFixture.pixel.key : null,
      channels: cachedFixture.channels.map((channel) => channel.name),
    }));

    return {
      fixtures: ['par', 'bar'],
      parts,
      presets: ['look'],
      steps: [['look-1', 'look-2']],
      scenes: ['scene-1', 'scene-2'],
      compositions: [{ uuid: 'song', name: 'Song' }],
      universes: ['u', 'v'],
    };
  }

  // every channel of every part with a value: its number among the values of the frame
  function fillValues() {
    const count = fake.index.parts.reduce((sum, part) => sum + part.channels.length, 0);
    fake.frameValues = [];

    for (let value = 0; value < count; value++) {
      fake.frameValues.push(value);
    }
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(EnginePreviewService);
    configService = TestBed.inject(ConfigService);
    projectService = TestBed.inject(ProjectService);
    fixtureService = TestBed.inject(FixtureService);
    presetService = TestBed.inject(PresetService);
    sceneService = TestBed.inject(SceneService);
    timelineService = TestBed.inject(TimelineService);
    previewService = TestBed.inject(PreviewService);

    project = newProject();
    projectService.project = project;
    fixtureService.updateCachedFixtures();
    timelineService.playState = 'paused';

    fake = new FakeEngine();
    fake.index = indexOf();
    fillValues();
    service.useEngine(fake.engine);
    configService.sharedEngine = true;
  });

  it('plays nothing while the switch is off', () => {
    configService.sharedEngine = false;

    expect(service.playing).toBe(false);
    expect(service.getChannelValues(0)).toBeUndefined();
    expect(fake.compiled.length).toBe(0);
  });

  it('plays nothing without a project', () => {
    projectService.project = undefined;

    expect(service.getChannelValues(0)).toBeUndefined();
  });

  it('compiles the project without what the designer previews', () => {
    project.selectedPresetUuid = 'look';
    project.identifyFixtureUuids = ['par'];

    service.getChannelValues(0);

    const compiled = JSON.parse(fake.compiled[0]);
    expect(compiled.fixtures.length).toBe(2);
    expect(compiled.fixtureProfiles.length).toBe(2);
    expect(compiled.selectedPresetUuid).toBeUndefined();
    expect(compiled.identifyFixtureUuids).toBeUndefined();
    expect(compiled.masterDimmerValue).toBeUndefined();
    expect(service.compileMillis).toBeGreaterThanOrEqual(0);
  });

  it('compiles the project again only once the show changed', () => {
    service.getChannelValues(0);
    project.selectedPresetUuid = 'look';
    project.masterDimmerValue = 1;
    service.getChannelValues(25);
    expect(fake.compiled.length).toBe(1);

    project.stageWidthCm = 800;
    service.getChannelValues(50);
    expect(fake.compiled.length).toBe(2);
    expect(fake.freed).toEqual([1]);

    project.fixtureProfiles.push(project.fixtureProfiles[0]);
    service.getChannelValues(75);
    expect(fake.compiled.length).toBe(3);

    project.fixtureProfiles = project.fixtureProfiles.slice();
    service.getChannelValues(100);
    expect(fake.compiled.length).toBe(4);

    service.invalidate();
    service.getChannelValues(125);
    expect(fake.compiled.length).toBe(5);

    projectService.project = newProject();
    fixtureService.updateCachedFixtures();
    service.getChannelValues(150);
    expect(fake.compiled.length).toBe(6);
  });

  it('gives each part of the designer the values of its part of the show', () => {
    const values = service.getChannelValues(0);
    const par = fixtureService.cachedFixtures.find((cachedFixture) => cachedFixture.fixture.uuid === 'par');
    const pixel = fixtureService.cachedFixtures.find((cachedFixture) => cachedFixture.pixel);
    const parIndex = fake.index.parts.findIndex((part: any) => part.fixture === 0 && part.pixelKey === null);
    let base = 0;

    for (let part = 0; part < parIndex; part++) {
      base += fake.index.parts[part].channels.length;
    }

    const parValues = values.get(par);
    expect(parValues.map((value) => value.channelName)).toEqual(par.channels.map((channel) => channel.name));
    expect(parValues[0].value).toBe(base);
    expect(parValues[0].profileUuid).toBe('test/rgb-par');
    expect(values.get(pixel).length).toBe(pixel.channels.length);
  });

  it('leaves out the channels without a value, and the second channel of a name', () => {
    const par = fixtureService.cachedFixtures.find((cachedFixture) => cachedFixture.fixture.uuid === 'par');
    const part = fake.index.parts.find((candidate: any) => candidate.fixture === 0 && candidate.pixelKey === null);
    part.channels = ['Dimmer', 'Red', 'Red'];
    fake.index.parts = [part];
    fake.frameValues = [NaN, 10, 20];

    const values = service.getChannelValues(0);

    expect(values.get(par).map((value) => [value.channelName, value.value])).toEqual([['Red', 10]]);
    // a part the show hasn't gets no values
    expect(values.get(fixtureService.cachedFixtures.find((cachedFixture) => cachedFixture.pixel))).toEqual([]);
  });

  it('finds the parts again once the fixtures changed', () => {
    service.getChannelValues(0);
    fixtureService.updateCachedFixtures();

    const values = service.getChannelValues(25);

    expect(values.get(fixtureService.cachedFixtures[0]).length).toBeGreaterThan(0);
  });

  it('previews the preset being edited, at its step or with its steps running', () => {
    project.previewPreset = true;
    presetService.selectedPreset = project.presets[0];
    presetService.selectedStep = project.presets[0].steps[1];

    service.getChannelValues(0);
    project.stepPreviewRunning = true;
    project.stepPreviewStartMillis = 300;
    service.getChannelValues(25);

    expect(fake.callsOf('le_play_preview')).toEqual([
      [1, 1],
      [1, 1],
    ]);
    expect(fake.callsOf('le_select_preset')).toEqual([
      [1, 0, 1],
      [1, 0, 1],
    ]);
    expect(fake.callsOf('le_set_step_preview')).toEqual([
      [1, 0, 0],
      [1, 1, 300000],
    ]);
  });

  it('previews no preset if none is selected, or one the show does not know', () => {
    service.getChannelValues(0);
    presetService.selectedPreset = new Preset({ uuid: 'unknown' });
    presetService.selectedStep = undefined;
    service.getChannelValues(25);

    expect(fake.callsOf('le_select_preset')).toEqual([
      [1, -1, -1],
      [1, -1, -1],
    ]);
  });

  it('previews the selected scenes it knows', () => {
    sceneService.selectedScenes = [project.scenes[1], new Scene({ uuid: 'unknown' })];

    service.getChannelValues(0);

    expect(fake.callsOf('le_play_preview')).toEqual([[1, 0]]);
    expect(fake.callsOf('le_select_scene')).toEqual([[1, 1, 1]]);
  });

  it('plays the timeline of the composition playing, with its holds', () => {
    timelineService.selectedComposition = project.compositions[0];
    timelineService.playState = 'playing';
    timelineService.holds = [{ positionMillis: 1000, heldMillis: 400 }];

    service.getChannelValues(2000);
    service.getChannelValues(2025);

    // (once: playing it again starts what follows the beat over)
    expect(fake.callsOf('le_play_timeline')).toEqual([[1, 0, 0]]);
    expect(fake.callsOf('le_add_hold')).toEqual([
      [1, 1000000, 400000],
      [1, 1000000, 400000],
    ]);
    expect(fake.callsOf('le_set_position')[1]).toEqual([1, 2025000, 2025000, 0]);
  });

  it('leaves a composition the show does not know to the TypeScript engine', () => {
    timelineService.selectedComposition = undefined;
    timelineService.playState = 'playing';

    expect(service.getChannelValues(0)).toBeUndefined();
  });

  it('marks the fixtures identified, reset or lamped on', () => {
    project.identifyFixtureUuids = ['bar'];
    project.resetFixtureUuids = ['par'];
    project.lampOnFixtureUuids = ['par', 'bar'];

    service.getChannelValues(0);

    expect(fake.callsOf('le_identify')).toEqual([
      [1, 0, 0],
      [1, 1, 1],
    ]);
    expect(fake.callsOf('le_reset_fixture')).toEqual([
      [1, 0, 1],
      [1, 1, 0],
    ]);
    expect(fake.callsOf('le_lamp_on')).toEqual([
      [1, 0, 1],
      [1, 1, 1],
    ]);
  });

  it('holds the channels of the faders and dims by the master dimmer', () => {
    project.dmxOverrides = [
      { universeUuid: 'v', dmxChannel: 4, value: 99 },
      { universeUuid: 'unknown', dmxChannel: 1, value: 1 },
    ];

    service.getChannelValues(0);
    project.masterDimmerValue = undefined;
    service.getChannelValues(25);

    expect(fake.callsOf('le_set_override')).toEqual([
      [1, 1, 4, 99],
      [1, 1, 4, 99],
    ]);
    expect(fake.callsOf('le_set_master_dimmer')).toEqual([
      [1, 0.5],
      [1, 1],
    ]);
  });

  it('hands over the audio of the last 6 s, then only the frames it does not have', () => {
    const audio = (index: number) => (index === 5 ? undefined : [index]);

    service.getChannelValues(6000, audio);
    let frames = fake.callsOf('le_audio_frame').map((call) => call[1]);
    expect(frames.length).toBe(300);
    expect(frames[0]).toBe(0);
    expect(frames[frames.length - 1]).toBe(300);

    fake.calls = [];
    service.getChannelValues(6045, audio);
    expect(fake.callsOf('le_audio_frame').map((call) => call[1])).toEqual([301, 302]);
    expect(fake.callsOf('le_clear_audio').length).toBe(0);

    // a jump back starts over
    fake.calls = [];
    service.getChannelValues(100, audio);
    expect(fake.callsOf('le_clear_audio').length).toBe(1);
    frames = fake.callsOf('le_audio_frame').map((call) => call[1]);
    expect(frames).toEqual([0, 1, 2, 3, 4]);

    // no audio anymore: forgotten once
    fake.calls = [];
    service.getChannelValues(125);
    service.getChannelValues(150);
    expect(fake.callsOf('le_clear_audio').length).toBe(1);
  });

  it('leaves a project it can not compile to the TypeScript engine', () => {
    spyOn(console, 'warn');
    fake.compileCode = CompileCode.unreadable;
    fake.message = 'no such profile';

    expect(service.getChannelValues(0)).toBeUndefined();
    expect(service.getChannelValues(25)).toBeUndefined();
    expect(service.unplayable).toBe('no such profile');
    expect(console.warn).toHaveBeenCalledTimes(1);

    fake.message = '';
    service.invalidate();
    service.getChannelValues(50);
    expect(service.unplayable).toBe('code 1');

    fake.compileCode = CompileCode.show;
    service.invalidate();
    expect(service.getChannelValues(75)).toBeDefined();
    expect(service.unplayable).toBeUndefined();
  });

  it('leaves a show the engine does not take to the TypeScript engine', () => {
    fake.refuseShows = true;

    expect(service.getChannelValues(0)).toBeUndefined();
  });

  it('has the universes of the frame it played', () => {
    const universe = new Array(512).fill(0);
    universe[7] = 42;
    fake.universes = [universe, new Array(512).fill(1)];

    expect(service.getUniverse('u')).toBeUndefined();
    const values = service.getChannelValues(0);

    expect(service.playedFrame(values)).toBe(true);
    expect(service.playedFrame(new Map())).toBe(false);
    expect(service.getUniverse('u')[7]).toBe(42);
    expect(service.getUniverse('unknown')).toBeUndefined();
    expect(service.getUniverse(undefined)).toBeUndefined();

    service.setOn(false);
    expect(service.playedFrame(values)).toBe(false);
    expect(service.getUniverse('u')).toBeUndefined();
  });

  it('compares itself with the TypeScript engine: the values and the universes', () => {
    fake.universes = [new Array(512).fill(10), new Array(512).fill(0)];
    const par = fixtureService.cachedFixtures.find((cachedFixture) => cachedFixture.fixture.uuid === 'par');

    const comparison = service.compare(
      [0, 40],
      () => {
        const values = service.getChannelValues(0);
        const typeScript = new Map<any, FixtureChannelValue[]>();
        values.forEach((partValues, cachedFixture) =>
          typeScript.set(
            cachedFixture,
            partValues.map((value) => new FixtureChannelValue(value))
          )
        );
        const parValues = typeScript.get(par);
        // one within 1, one beyond, one only the TypeScript engine has, one only the engine has, a name twice
        parValues[0].value += 0.5;
        parValues[1].value += 3;
        parValues.push(new FixtureChannelValue({ channelName: 'Extra', value: 1 }));
        parValues.push(new FixtureChannelValue({ channelName: 'Extra', value: 2 }));
        parValues.splice(2, 1);
        return typeScript;
      },
      (universeUuid) => {
        const universe = new Array(512).fill(universeUuid === 'u' ? 10 : 0);
        universe[0] = 13;
        return universe;
      },
      () => undefined
    );

    expect(comparison.frames).toBe(2);
    expect(comparison.largest).toBe(13);
    // per frame: a value beyond 1, one of the TypeScript engine only, one of the engine only and DMX 1 of both universes
    expect(comparison.differenceCount).toBe(10);
    expect(comparison.differences[0].typeScript === undefined || comparison.differences[0].engine === undefined).toBe(true);
    expect(comparison.differences.some((difference) => difference.place === 'universe u / DMX 1')).toBe(true);
    expect(comparison.differences.some((difference) => difference.place.indexOf('Par: ') === 0)).toBe(true);
  });

  it('keeps the largest differences of a comparison', () => {
    EnginePreviewService.maxDifferences = 3;

    try {
      const comparison = service.compare(
        [0],
        () => new Map(),
        () => new Array(512).fill(100)
      );

      expect(comparison.differenceCount).toBe(1024);
      expect(comparison.differences.length).toBe(3);
    } finally {
      EnginePreviewService.maxDifferences = 50;
    }
  });

  it('compares nothing while it does not play', () => {
    configService.sharedEngine = false;

    expect(
      service.compare(
        [0],
        () => new Map(),
        () => []
      ).frames
    ).toBe(0);
  });

  it('loads engine.wasm once the switch is turned on, and plays with the TypeScript engine without it', async () => {
    const fresh = TestBed.inject(EnginePreviewService);
    spyOn(console, 'warn');
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('', { status: 404 })));
    (fresh as any).loading = undefined;
    fresh.state = 'off';

    fresh.setOn(true);
    expect(fresh.state).toBe('loading');
    expect(fresh.playing).toBe(false);
    await fresh.load();

    expect(fresh.state).toBe('missing');
    expect(fresh.playing).toBe(false);
    expect(console.warn).toHaveBeenCalled();
    expect(window.fetch).toHaveBeenCalledWith('assets/engine/engine.wasm');
  });

  it('is ready once engine.wasm is loaded', async () => {
    const emptyModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(emptyModule, { status: 200 })));
    (service as any).loading = undefined;

    const engine = await service.load();

    expect(engine).toBeDefined();
    expect(service.state).toBe('ready');
    expect(await service.load()).toBe(engine);
  });

  it('forgets its show when the switch is turned off, or when it is done with', () => {
    service.getChannelValues(0);
    service.setOn(false);

    expect(configService.sharedEngine).toBe(false);
    expect(fake.freed).toEqual([1]);

    configService.sharedEngine = true;
    service.getChannelValues(0);
    service.ngOnDestroy();
    expect(fake.freed).toEqual([1, 2]);
  });

  describe('in the preview', () => {
    it('works out the frames of the preview and keeps the step list going', () => {
      presetService.selectedPreset = project.presets[0];
      project.stepPreviewRunning = true;
      project.stepPreviewStartMillis = 0;
      previewService.getTypeScriptChannelValues(1100, previewService.getPresets(1100));
      const typeScriptStep = presetService.activeStep;
      presetService.activeStep = undefined;
      const typeScript = spyOn(previewService, 'getTypeScriptChannelValues').and.callThrough();

      const values = previewService.getChannelValues(1100, previewService.getPresets(1100));

      expect(service.playedFrame(values)).toBe(true);
      expect(typeScript).not.toHaveBeenCalled();
      expect(typeScriptStep).toBeDefined();
      expect(presetService.activeStep).toBe(typeScriptStep);
    });

    it('leaves a scene of the AI looks to the TypeScript engine', () => {
      previewService.previewAiScene(new Scene({ uuid: 'ai' }), [], 0);

      const values = previewService.getChannelValues(100, previewService.getPresets(100));

      expect(service.playedFrame(values)).toBe(false);
    });

    it('falls back to the TypeScript engine where the engine can not play', () => {
      fake.compileCode = CompileCode.tooLarge;
      spyOn(console, 'warn');

      const values = previewService.getChannelValues(100, previewService.getPresets(100));

      expect(values).toBeDefined();
      expect(service.playedFrame(values)).toBe(false);
    });

    it('hands the engine the audio the effects follow', () => {
      const frames = () => [1];
      previewService.audioFrames = frames;
      expect(previewService.getEngineAudioFrames()).toBe(frames);

      previewService.audioFrames = undefined;
      expect(previewService.getEngineAudioFrames()).toBeDefined();

      const composition = () => [2];
      spyOn(timelineService, 'audioFramesFor').and.returnValue(composition);
      timelineService.playState = 'playing';
      expect(previewService.getEngineAudioFrames()).toBe(composition);
    });

    it('sends the universes of the frame of the engine on the DMX channels', () => {
      const dmxService = TestBed.inject(DmxService);
      const universe = new Array(512).fill(0);
      universe[2] = 77;
      fake.universes = [universe, new Array(512).fill(0)];

      const values = previewService.getChannelValues(100, previewService.getPresets(100));

      expect(dmxService.getUniverseValues('u', values)[2]).toBe(77);
      // a universe the show hasn't: the faders on it, worked out by the designer
      expect(dmxService.getUniverseValues('w', values)[2]).toBe(0);
      // values of the TypeScript engine
      expect(dmxService.getUniverseValues('u', new Map())[2]).toBe(0);
    });
  });
});
