import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { caseFiles, profiles } from '../../conformance/index';
import { LightingEngine, loadLightingEngine } from './engine/lighting-engine';
import { Project } from './models/project';
import { ConfigService } from './services/config.service';
import { DmxService } from './services/dmx.service';
import { EnginePreviewService } from './services/engine-preview.service';
import { FixtureService } from './services/fixture.service';
import { PresetService } from './services/preset.service';
import { PreviewService } from './services/preview.service';
import { ProjectService } from './services/project.service';
import { SceneService } from './services/scene.service';
import { TimelineService } from './services/timeline.service';

// The channelValues cases of web/projects/designer/conformance played by the shared lighting engine (engine.wasm) the
// way the designer plays its preview with it: through PreviewService.getChannelValues with the switch on. The engine
// computes in single precision where the TypeScript engine the values were recorded from computes in doubles, so a
// value may differ by 1 (of 255, or of 65535 for a channel with a fine channel). engine.wasm is not in git (see
// web/engine/build.sh): without it these specs are skipped.

// where karma serves web/engine/engine.wasm (see karma.conf.js)
const engineUrl = '/assets/engine/engine.wasm';

// The values beyond 1 which are explained: each sits exactly on an edge where the recorded value is decided by the
// rounding of a double (conformance/DIFFERENCES.md of the engine). The case, the parts and why.
export const explainedDifferences: { name: string; keys: string[]; why: string }[] = [
  {
    name: 'white and amber from the colors, and the color temperature as a color',
    keys: ['rgbwa'],
    why: 'the green left over once the amber LED took its part is 0: a hair below 0 in doubles, which the recorded values take as no value',
  },
  {
    name: 'comet-2',
    keys: ['matrix-groups/Top', 'matrix-groups/Corners'],
    why: 'the place in the palette is exactly on the border of two stepped stops',
  },
  { name: 'image-1', keys: ['matrix/4', 'matrix/8', 'matrix/12'], why: 'the scrolled image is exactly on the border of two of its pixels' },
  {
    name: 'meter-1',
    keys: ['bar-1/1', 'bar-1/3', 'bar-2/1', 'bar-2/3', 'band-thirds/1/3', 'band-thirds/3/3'],
    why: 'the place in the palette is exactly on the border of two stepped stops',
  },
  {
    name: 'scope-1',
    keys: ['bar-1/1', 'bar-1/3', 'bar-2/1', 'bar-2/3', 'band-thirds/1/3', 'band-thirds/3/3'],
    why: 'the pixel is exactly on the border of two frames of the wave',
  },
];

let loaded: Promise<LightingEngine>;

// engine.wasm, once for all specs; undefined if it is not there
export function sharedEngine(): Promise<LightingEngine> {
  if (!loaded) {
    loaded = loadLightingEngine(engineUrl).then(
      (engine) => engine,
      () => undefined
    );
  }

  return loaded;
}

function resolveProfiles(project: any): any {
  const resolved = JSON.parse(JSON.stringify(project));

  resolved.fixtureProfiles = (resolved.fixtureProfiles || []).map((profile: any) =>
    profile.$profile ? { ...JSON.parse(JSON.stringify(profiles[profile.$profile])), uuid: profile.$profile } : profile
  );

  return resolved;
}

function services(engine: LightingEngine) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });

  const engineService = TestBed.inject(EnginePreviewService);
  engineService.useEngine(engine);
  TestBed.inject(ConfigService).sharedEngine = true;

  return {
    projectService: TestBed.inject(ProjectService),
    fixtureService: TestBed.inject(FixtureService),
    presetService: TestBed.inject(PresetService),
    sceneService: TestBed.inject(SceneService),
    timelineService: TestBed.inject(TimelineService),
    previewService: TestBed.inject(PreviewService),
    dmxService: TestBed.inject(DmxService),
    engineService,
  };
}

// Set the designer up to preview a run of a case (like conformance.spec.ts does for the TypeScript engine)
function setUp(s: ReturnType<typeof services>, project: Project, preview: any, audio: any, holds: any[]) {
  const audioFrames: number[][] = audio?.frames ?? [];
  s.previewService.audioFrames = (index: number) => audioFrames[index];

  s.projectService.project = project;
  s.fixtureService.updateCachedFixtures();
  s.timelineService.selectedComposition = project.compositions.find((composition) => composition.uuid === project.selectedCompositionUuid);
  s.timelineService.playState = 'paused';
  project.previewPreset = false;
  s.sceneService.selectedScenes = [];
  s.presetService.selectedPreset = undefined;
  s.presetService.selectedStep = undefined;
  project.stepPreviewRunning = false;

  if (preview.mode === 'timeline') {
    s.timelineService.selectedComposition = project.compositions.find((composition) => composition.name === preview.composition);
    s.timelineService.playState = 'playing';
  } else if (preview.mode === 'preset') {
    project.previewPreset = true;
    s.presetService.selectedPreset = project.presets.find((preset) => preset.uuid === preview.preset);
    s.presetService.selectedStep = s.presetService.selectedPreset?.steps.find((step) => step.uuid === preview.step);

    if (preview.stepPreviewStartMillis !== undefined) {
      project.stepPreviewRunning = true;
      project.stepPreviewStartMillis = preview.stepPreviewStartMillis;
    }
  } else {
    s.sceneService.selectedScenes = project.scenes.filter((scene) => preview.scenes.indexOf(scene.uuid) >= 0);
  }

  s.timelineService.holds = holds ?? [];
  project.identifyFixtureUuids = preview.identify ?? [];
  project.resetFixtureUuids = preview.reset ?? [];
  project.lampOnFixtureUuids = preview.lampOn ?? [];

  // each run plays from the start, like the engine of the cases (what follows the beat starts over)
  s.engineService.invalidate();
}

interface Report {
  frames: number;
  values: number;
  largest: number;
  explained: number;
  differences: string[];
}

function playCase(engine: LightingEngine, conformanceCase: any, report: Report) {
  const s = services(engine);
  const input = conformanceCase.input;
  const project = new Project(resolveProfiles(input.project));
  const explained = explainedDifferences.find((difference) => difference.name === conformanceCase.name);

  input.runs.forEach((run: any, runIndex: number) => {
    setUp(s, project, run.preview, input.audio, run.holds);

    run.times.forEach((timeMillis: number, frameIndex: number) => {
      const values = s.previewService.getChannelValues(timeMillis, s.previewService.getPresets(timeMillis));

      if (!s.engineService.playedFrame(values)) {
        report.differences.push(conformanceCase.name + ': not played by the engine (' + s.engineService.unplayable + ')');
        return;
      }

      report.frames++;
      const expectedFrame = conformanceCase.expected[runIndex][frameIndex];

      for (const cachedFixture of s.fixtureService.cachedFixtures) {
        const key = cachedFixture.fixture.uuid + (cachedFixture.pixel ? '/' + cachedFixture.pixel.key : '');
        const expected = expectedFrame[key] || {};
        const actual = new Map<string, number>();

        for (const value of values.get(cachedFixture)) {
          actual.set(value.channelName, value.value);
        }

        const names = Object.keys(expected);
        actual.forEach((value, name) => {
          if (!(name in expected)) {
            names.push(name);
          }
        });

        for (const name of names) {
          report.values++;
          const expectedValue = expected[name];
          const actualValue = actual.get(name);
          const difference =
            typeof expectedValue === 'number' && actualValue !== undefined ? Math.abs(expectedValue - actualValue) : Infinity;

          if (difference <= 1) {
            report.largest = Math.max(report.largest, difference);
          } else if (explained && explained.keys.indexOf(key) >= 0) {
            report.explained++;
          } else {
            report.differences.push(
              `${conformanceCase.name}, run ${runIndex} at ${timeMillis} ms, ${key} ${name}: recorded ${expectedValue}, engine ${actualValue}`
            );
          }
        }
      }
    });
  });
}

// The same cases compared with the TypeScript engine as it plays them now, by EnginePreviewService.compare: the values
// of every part and the universes sent (the DMX channels), not only the recorded values
function compareCase(engine: LightingEngine, conformanceCase: any, totals: { frames: number; values: number; differences: string[] }) {
  const s = services(engine);
  const input = conformanceCase.input;
  const project = new Project(resolveProfiles(input.project));
  const explained = explainedDifferences.some((difference) => difference.name === conformanceCase.name);

  input.runs.forEach((run: any) => {
    setUp(s, project, run.preview, input.audio, run.holds);

    const comparison = s.engineService.compare(
      run.times,
      (timeMillis) => s.previewService.getTypeScriptChannelValues(timeMillis, s.previewService.getPresets(timeMillis)),
      (universeUuid, values) => s.dmxService.getTypeScriptUniverseValues(universeUuid, values),
      () => s.previewService.getEngineAudioFrames()
    );

    totals.frames += comparison.frames;
    totals.values += comparison.values;

    if (!explained) {
      for (const difference of comparison.differences) {
        totals.differences.push(
          `${conformanceCase.name} at ${difference.timeMillis} ms, ${difference.place}: TypeScript ${difference.typeScript}, engine ${difference.engine}`
        );
      }
    }
  });
}

// the rig of 60 moving heads of the engine's benchmark (crates/compiler/examples/bench.rs): two scenes with fans, a
// chase, a movement and steps
export function headsRig(count: number): any {
  const fixtures = [];
  const all = [];

  for (let index = 0; index < count; index++) {
    fixtures.push({
      uuid: 'head-' + index,
      profileUuid: 'dts/xr4-spot',
      modeShortName: '17ch',
      dmxUniverseUuid: 'universe-' + Math.floor(index / 30),
      dmxFirstChannel: (index % 30) * 17,
    });
    all.push({ fixtureUuid: 'head-' + index });
  }

  const half = all.filter((fixture, index) => index % 2 === 0);
  const color = (name: string, valuePercentage: number) => ({ type: 'ColorIntensity', color: name, valuePercentage });

  return resolveProfiles({
    version: 11,
    fixtureProfiles: [{ $profile: 'dts/xr4-spot' }],
    fixtures,
    presetFixtures: all,
    presets: [
      {
        uuid: 'look',
        fixtures: all,
        steps: [
          {
            uuid: 'look-step',
            startMillis: 0,
            fixtureCapabilityValues: [
              {
                type: 'Intensity',
                valuePercentage: 0.5,
                fan: [
                  { position: 0, valuePercentage: 0.2 },
                  { position: 1, valuePercentage: 1 },
                ],
              },
              color('Red', 1),
              color('Green', 0.3),
              color('Blue', 0.1),
              { type: 'Pan', valueDegrees: 0, spreadDegrees: 120 },
              { type: 'Tilt', valueDegrees: 30 },
              { type: 'Zoom', valuePercentage: 0.4 },
              { type: 'ShutterStrobe', valuePercentage: 0 },
            ],
          },
        ],
        effects: [
          {
            type: 'curve',
            uuid: 'chase',
            curveType: 'sine',
            lengthMillis: 2000,
            phasingMode: 'spread',
            capabilities: [{ type: 'Intensity' }],
          },
          { type: 'pan-tilt', uuid: 'circle', shape: 'circle', lengthMillis: 4000, phasingMode: 'spread', fanMode: 'linear' },
        ],
      },
      {
        uuid: 'steps',
        fixtures: half,
        stepsLoop: true,
        stepsPhasingMode: 'spread',
        steps: [
          {
            uuid: 'a',
            startMillis: 0,
            transitionMillis: 500,
            fixtureCapabilityValues: [color('Red', 0), color('Blue', 1), { type: 'Iris', valuePercentage: 0.2 }],
          },
          {
            uuid: 'b',
            startMillis: 1000,
            transitionMillis: 500,
            fixtureCapabilityValues: [color('Red', 1), color('Blue', 0), { type: 'Iris', valuePercentage: 1 }],
          },
          {
            uuid: 'c',
            startMillis: 2000,
            transitionMillis: 500,
            fixtureCapabilityValues: [color('Green', 1), { type: 'Iris', valuePercentage: 0.6 }],
          },
        ],
        effects: [
          { type: 'curve', uuid: 'zoom', curveType: 'triangle', lengthMode: 'beats', lengthBeats: 2, capabilities: [{ type: 'Zoom' }] },
        ],
      },
    ],
    scenes: [
      { uuid: 'base', presetUuids: ['look'] },
      { uuid: 'top', presetUuids: ['steps'], dimmer: 0.8 },
    ],
  });
}

// the rig of 2,048 RGB pixels of the benchmark: 16 matrices of 16 x 8 pixels with a plasma
export function pixelsRig(count: number): any {
  const fixtures = [];
  const pixels = [];
  const channel = (color: string) => ({ fineChannelAliases: [], capability: { type: 'ColorIntensity', color } });

  for (let index = 0; index < count; index++) {
    fixtures.push({
      uuid: 'matrix-' + index,
      profileUuid: 'matrix',
      modeShortName: '384ch',
      dmxUniverseUuid: 'universe-' + index,
      dmxFirstChannel: 0,
    });

    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 16; x++) {
        pixels.push({ fixtureUuid: 'matrix-' + index, pixelKey: '(' + x + ', ' + y + ')' });
      }
    }
  }

  return {
    version: 11,
    fixtureProfiles: [
      {
        uuid: 'matrix',
        matrix: { pixelCount: [16, 8, 1] },
        availableChannels: {},
        templateChannels: { 'Red $pixelKey': channel('Red'), 'Green $pixelKey': channel('Green'), 'Blue $pixelKey': channel('Blue') },
        modes: [
          {
            name: '384-channel',
            shortName: '384ch',
            channels: [
              {
                name: '',
                insert: 'matrixChannels',
                repeatFor: ['eachPixelXYZ'],
                channelOrder: 'perPixel',
                templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'],
              },
            ],
          },
        ],
      },
    ],
    fixtures,
    presetFixtures: pixels,
    presets: [
      {
        uuid: 'pixels',
        fixtures: pixels,
        steps: [{ uuid: 'step', fixtureCapabilityValues: [{ type: 'ColorIntensity', color: 'Red', valuePercentage: 0.5 }] }],
        effects: [
          {
            type: 'pixel',
            uuid: 'plasma',
            pattern: 'plasma',
            lengthMillis: 4000,
            palette: {
              ref: 'rainbow',
              stops: [
                { position: 0, color: '#ff0000' },
                { position: 0.5, color: '#00ff00' },
                { position: 1, color: '#0000ff' },
              ],
            },
          },
        ],
      },
    ],
    scenes: [{ uuid: 'scene', presetUuids: ['pixels'] }],
  };
}

// How long a compile, an edit reaching the preview and a frame take in this browser, for a rig
function measure(
  engine: LightingEngine,
  name: string,
  projectData: any
): { compile: number; edit: number; frame: number; typeScriptFrame: number } {
  const json = JSON.stringify(projectData);

  // (the clock of a page which isn't isolated counts in steps of 0.1 ms: the runs are timed together)
  let started = performance.now();
  expect(engine.compile(json).code).toBe(0);
  const first = performance.now() - started;
  const compiles = 50;
  started = performance.now();

  for (let run = 0; run < compiles; run++) {
    engine.compile(json);
  }

  const compile = (performance.now() - started) / compiles;

  // the designer: an edit compiles the project again on the next frame, which plays it
  const s = services(engine);
  const project = new Project(projectData);
  s.projectService.project = project;
  s.fixtureService.updateCachedFixtures();
  s.timelineService.playState = 'paused';
  s.sceneService.selectedScenes = project.scenes.slice();
  s.previewService.audioFrames = () => undefined;
  const edits = 30;
  started = performance.now();

  for (let run = 0; run < edits; run++) {
    project.stageWidthCm = 600 + run;
    s.previewService.getChannelValues(1000, s.previewService.getPresets(1000));
  }

  const edit = (performance.now() - started) / edits;

  const frames = 200;
  started = performance.now();

  for (let frame = 0; frame < frames; frame++) {
    s.previewService.getChannelValues(frame * 25, s.previewService.getPresets(frame * 25));
  }

  const frame = (performance.now() - started) / frames;
  started = performance.now();

  for (let index = 0; index < frames / 4; index++) {
    s.previewService.getTypeScriptChannelValues(index * 25, s.previewService.getPresets(index * 25));
  }

  const typeScriptFrame = (performance.now() - started) / (frames / 4);
  const result = { compile, edit, frame, typeScriptFrame };

  console.log(
    `engine.wasm in ${navigator.userAgent.replace(/.*(Chrome\/[0-9.]+).*/, '$1')}, ${name}: project ${Math.round(
      json.length / 1024
    )} KB, ` +
      `compile ${result.compile.toFixed(2)} ms (the first ${first.toFixed(2)} ms), an edit to the preview ${result.edit.toFixed(2)} ms, ` +
      `a frame ${result.frame.toFixed(3)} ms (the TypeScript engine ${result.typeScriptFrame.toFixed(3)} ms)`
  );

  return result;
}

describe('The shared lighting engine in the designer', () => {
  let engine: LightingEngine;

  beforeAll(async () => {
    engine = await sharedEngine();
  });

  for (const fileName of Object.keys(caseFiles)) {
    const file = { file: fileName, data: caseFiles[fileName] };

    if (file.data.kind !== 'channelValues') {
      continue;
    }

    it('plays the cases of ' + file.file + ' within 1 of the recorded values', () => {
      if (!engine) {
        pending('engine.wasm is not built (web/engine/build.sh)');
        return;
      }

      const report: Report = { frames: 0, values: 0, largest: 0, explained: 0, differences: [] };

      for (const conformanceCase of file.data.cases) {
        playCase(engine, conformanceCase, report);
      }

      console.log(
        `engine.wasm, ${file.file}: ${file.data.cases.length} cases, ${report.frames} frames, ${report.values} values, ` +
          `the largest difference ${report.largest.toFixed(4)}, ${report.explained} explained beyond 1, ${report.differences.length} not`
      );
      expect(report.frames).toBeGreaterThan(0);
      expect(report.differences.slice(0, 20)).toEqual([]);
    });

    it('agrees with the TypeScript engine on the values and the universes of the cases of ' + file.file, () => {
      if (!engine) {
        pending('engine.wasm is not built (web/engine/build.sh)');
        return;
      }

      const totals = { frames: 0, values: 0, differences: [] };

      for (const conformanceCase of file.data.cases) {
        compareCase(engine, conformanceCase, totals);
      }

      console.log(
        `engine.wasm against the TypeScript engine, ${file.file}: ${totals.frames} frames, ${totals.values} values and DMX channels`
      );
      expect(totals.frames).toBeGreaterThan(0);
      expect(totals.differences.slice(0, 20)).toEqual([]);
    });
  }

  it('compiles the rig of 60 moving heads within the budget of a frame', async () => {
    if (!engine) {
      pending('engine.wasm is not built (web/engine/build.sh)');
      return;
    }

    // a module loaded afresh: the first compile is the slowest, before the browser optimized the code of the module
    let started = performance.now();
    const fresh = await loadLightingEngine(engineUrl);
    const loadMillis = performance.now() - started;
    started = performance.now();
    fresh.compile(JSON.stringify(headsRig(60)));
    console.log(
      `engine.wasm loaded in ${loadMillis.toFixed(1)} ms, its first compile of the 60 moving heads ${(performance.now() - started).toFixed(
        1
      )} ms`
    );

    const result = measure(engine, '60 moving heads', headsRig(60));
    measure(engine, '30 moving heads', headsRig(30));
    measure(engine, '2048 pixels', pixelsRig(16));

    // the gate of the plan (docs/lighting-engine.md): a compile under 10 ms
    expect(result.compile).toBeLessThan(10);
  });
});
