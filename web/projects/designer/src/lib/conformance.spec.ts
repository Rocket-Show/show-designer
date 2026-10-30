import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';

import { caseFiles, profiles } from '../../conformance/index';
import { CachedFixturePixel } from './models/cached-fixture-pixel';
import { EffectCurve } from './models/effect-curve';
import { FixtureCapabilityValue } from './models/fixture-capability-value';
import { FixtureChannel } from './models/fixture-channel';
import { FixtureMatrixPixelGroup } from './models/fixture-matrix-pixel-group';
import { FixtureProfile } from './models/fixture-profile';
import { Preset } from './models/preset';
import { PresetFixture } from './models/preset-fixture';
import { PresetRegionScene } from './models/preset-region-scene';
import { PresetStepState } from './models/preset-step-state';
import { parseProfileNumber } from './models/profile-number';
import { Project } from './models/project';
import { Scene } from './models/scene';
import { ScenePlaybackRegion } from './models/scene-playback-region';
import { applyTransitionCurve } from './models/transition-curve';
import { FixturePixelGroupResolveService } from './services/fixture-pixel-group-resolve.service';
import { FixtureService } from './services/fixture.service';
import { PresetStepService } from './services/preset-step.service';
import { PresetService } from './services/preset.service';
import { PreviewService } from './services/preview.service';
import { ProjectLoadService } from './services/project-load.service';
import { ProjectService } from './services/project.service';
import { SceneService } from './services/scene.service';
import { TimelineService } from './services/timeline.service';
import { WarningDialogService } from './services/warning-dialog.service';

// The cases of web/projects/designer/conformance (see its README): Rocket Show plays a project with
// an engine of its own, which has to come to the very same values as the designer. Both run these
// cases, Rocket Show with DesignerConformanceTest on a copy of them. The expected values are
// recorded from the designer (npm run conformance:record) and compared exactly.

interface ConformanceCase {
  name: string;
  input: any;
  expected?: any;
}

interface CaseFile {
  kind: string;
  description?: string;
  cases: ConformanceCase[];
}

// undefined is written as null, like Rocket Show writes a missing value
function normalize(value: any): any {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number' && isNaN(value)) {
    return 'NaN';
  }

  return value;
}

// the profiles of a project named like the fixture library ("$profile": "stairville/mh-100") are
// taken from conformance/profiles
function resolveProfiles(project: any): any {
  const resolved = JSON.parse(JSON.stringify(project));

  resolved.fixtureProfiles = (resolved.fixtureProfiles || []).map((profile: any) => {
    if (!profile.$profile) {
      return profile;
    }

    const libraryProfile = profiles[profile.$profile];

    if (!libraryProfile) {
      throw new Error('Unknown profile ' + profile.$profile);
    }

    return { ...JSON.parse(JSON.stringify(libraryProfile)), uuid: profile.$profile };
  });

  return resolved;
}

// a capability value as the designer writes it, without the properties missing
function capabilityOf(value: FixtureCapabilityValue): any {
  const capability = {};

  for (const property of ['type', 'color', 'wheel', 'profileUuid', 'valuePercentage', 'slotNumber']) {
    if (value[property] !== undefined && value[property] !== null) {
      capability[property] = value[property];
    }
  }

  return capability;
}

function stateOf(state: PresetStepState): any {
  const effects = {};

  for (const effectUuid of Array.from(state.effectAmounts.keys()).sort()) {
    effects[effectUuid] = state.effectAmounts.get(effectUuid);
  }

  return {
    step: normalize(state.currentStep?.uuid),
    channels: state.fixtureChannelValues.map((value) => [normalize(value.profileUuid), value.channelName, normalize(value.value)]),
    capabilities: state.fixtureCapabilityValues.map(capabilityOf),
    effects,
  };
}

function pixelOf(pixel: CachedFixturePixel): any[] {
  return [pixel.key, pixel.x, pixel.y, pixel.z];
}

// the services the frames are worked out with, built once per case
function frameServices() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });

  return {
    projectService: TestBed.inject(ProjectService),
    fixtureService: TestBed.inject(FixtureService),
    presetService: TestBed.inject(PresetService),
    sceneService: TestBed.inject(SceneService),
    timelineService: TestBed.inject(TimelineService),
    previewService: TestBed.inject(PreviewService),
  };
}

// the values the preview gives every fixture (and pixel) of a project at the passed times, the way
// it plays the timeline of a composition, the selected preset or the selected scenes
function channelValues(projectData: any, preview: any, times: number[]): any[] {
  const services = frameServices();
  const project = new Project(resolveProfiles(projectData));

  services.projectService.project = project;
  services.fixtureService.updateCachedFixtures();

  // the composition open in the designer, which the curves synced to the beat follow
  services.timelineService.selectedComposition = project.compositions.find(
    (composition) => composition.uuid === project.selectedCompositionUuid
  );
  services.timelineService.playState = 'paused';
  project.previewPreset = false;
  services.sceneService.selectedScenes = [];

  if (preview.mode === 'timeline') {
    services.timelineService.selectedComposition = project.compositions.find((composition) => composition.name === preview.composition);
    services.timelineService.playState = 'playing';
  } else if (preview.mode === 'preset') {
    project.previewPreset = true;
    services.presetService.selectedPreset = project.presets.find((preset) => preset.uuid === preview.preset);
    services.presetService.selectedStep = services.presetService.selectedPreset?.steps.find((step) => step.uuid === preview.step);

    if (preview.stepPreviewStartMillis !== undefined) {
      project.stepPreviewRunning = true;
      project.stepPreviewStartMillis = preview.stepPreviewStartMillis;
    }
  } else if (preview.mode === 'scenes') {
    services.sceneService.selectedScenes = project.scenes.filter((scene) => preview.scenes.indexOf(scene.uuid) >= 0);
  } else {
    throw new Error('Unknown preview mode ' + preview.mode);
  }

  // the fixtures identified from the fixture pool, if any
  project.identifyFixtureUuids = preview.identify ?? [];

  return times.map((timeMillis: number) => {
    const values = services.previewService.getChannelValues(timeMillis, services.previewService.getPresets(timeMillis));
    const frame = {};

    for (const cachedFixture of services.fixtureService.cachedFixtures) {
      const fixtureValues = {};

      for (const value of values.get(cachedFixture)) {
        fixtureValues[value.channelName] = normalize(value.value);
      }

      frame[cachedFixture.fixture.uuid + (cachedFixture.pixel ? '/' + cachedFixture.pixel.key : '')] = fixtureValues;
    }

    return frame;
  });
}

// A project of an older version migrated to the current one, like the designer does when it opens
// it (ProjectLoadService.migrateFromOldProject)
function migrate(projectData: any): Project {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      BsModalService,
      // the dialog telling that the project has been migrated
      { provide: WarningDialogService, useValue: { show: () => of(true) } },
    ],
  });

  const projectService = TestBed.inject(ProjectService);
  projectService.project = new Project(resolveProfiles(projectData));
  TestBed.inject(ProjectLoadService)['migrateFromOldProject']();

  return projectService.project;
}

// a fixture of the project or of a preset: its uuid and its pixel (null for the fixture itself)
function presetFixtureOf(presetFixture: PresetFixture): any[] {
  return [presetFixture.fixtureUuid, normalize(presetFixture.pixelKey)];
}

// What both engines keep of a migrated project and play it with (see the README): the fixtures and
// pixels of the presets, the steps, the curves, the layers of the scenes and the tracks of the
// compositions. A clip names its track by its place in the composition: the uuid of a new track
// is a random one.
function migratedProjectOf(project: Project): any {
  return {
    version: project.version,
    presetFixtures: project.presetFixtures.map(presetFixtureOf),
    presets: project.presets.map((preset) => ({
      uuid: preset.uuid,
      fixtures: preset.fixtures.map(presetFixtureOf),
      useGlobalFixtureOrder: preset.useGlobalFixtureOrder,
      steps: preset.steps.map((step) => ({
        startMillis: step.startMillis,
        transitionMillis: normalize(step.transitionMillis),
        transitionCurve: step.transitionCurve,
        channels: step.fixtureChannelValues.map((value) => [
          normalize(value.profileUuid),
          normalize(value.channelName),
          normalize(value.value),
        ]),
        capabilities: step.fixtureCapabilityValues.map(capabilityOf),
        effects: step.effectAmounts.map((effectAmount) => [effectAmount.effectUuid, effectAmount.amount]),
      })),
      effects: preset.effects.map((effect) =>
        effect instanceof EffectCurve
          ? {
              uuid: effect.uuid,
              type: effect.type,
              curveType: effect.curveType,
              amplitude: effect.amplitude,
              channels: effect.channels.map((profileChannels) => [normalize(profileChannels.profileUuid), profileChannels.channels]),
            }
          : { uuid: effect.uuid, type: effect.type }
      ),
    })),
    scenes: project.scenes.map((scene) => [scene.uuid, scene.presetUuids]),
    compositions: project.compositions.map((composition) => ({
      uuid: composition.uuid,
      tracks: composition.tracks.map((track) => normalize(track.name)),
      clips: composition.scenePlaybackRegions.map((region) => [
        region.sceneUuid,
        composition.tracks.findIndex((track) => track.uuid === region.trackUuid),
      ]),
    })),
  };
}

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());
const resolveService = new FixturePixelGroupResolveService();
const presetStepService = new PresetStepService(undefined);

// what each kind of case runs: the input in, what the designer makes of it out
const kinds: { [kind: string]: (input: any) => any } = {
  transitionCurve: (input) => applyTransitionCurve(input.curve, input.position),

  effectCurve: (input) => {
    const curve = new EffectCurve(input.curve);
    const bpm = input.beatsPerMinute;

    return {
      lengthMillis: curve.getLengthMillis(bpm),
      phaseMillis: curve.getPhaseMillis(bpm),
      runEndMillis: normalize(curve.getRunEndMillis(bpm)),
      runLoopMillis: normalize(curve.getRunLoopMillis(input.fixtureCount, bpm)),
      samples: input.samples.map((sample: any) => [
        curve.getPhasingMillis(sample.fixtureIndex, input.fixtureCount, bpm),
        normalize(curve.getValueAtMillis(sample.timeMillis, sample.fixtureIndex, input.fixtureCount, bpm)),
      ]),
    };
  },

  presetSteps: (input) => {
    const preset = new Preset(input.preset);

    return {
      loopMillis: presetStepService.getStepsLoopMillis(preset),
      phased: presetStepService.stepsArePhased(preset),
      samples: input.samples.map((sample: any) => {
        const phasingMillis = presetStepService.getStepsPhasingMillis(preset, sample.fixtureIndex, input.fixtureCount);

        return { phasingMillis, state: stateOf(presetStepService.getStateAtMillis(preset, sample.timeMillis - phasingMillis)) };
      }),
    };
  },

  presetIntensity: (input) => {
    const previewService = new PreviewService(undefined, undefined, undefined, undefined, undefined, undefined);
    const playing = new PresetRegionScene(
      new Preset(input.preset),
      input.region ? new ScenePlaybackRegion(input.region) : undefined,
      input.scene ? new Scene(input.scene) : undefined
    );

    return input.times.map((timeMillis: number) => previewService['getPresetIntensity'](playing, timeMillis));
  },

  profileNumber: (input) => normalize(parseProfileNumber(input.text)),

  defaultValue: (input) => normalize(fixtureService['getDefaultValueByChannel'](new FixtureChannel(input.channel))),

  hexColor: (input) => {
    const color = fixtureService.hexToRgb(input.text);
    return color ? [color.red, color.green, color.blue] : null;
  },

  mixColors: (input) => {
    const color = fixtureService['mixHexColors'](input.colors);
    return color ? [color.red, color.green, color.blue] : null;
  },

  pixels: (input) => {
    const profile = new FixtureProfile({ matrix: input.matrix });
    const allPixels = fixtureService.getAllPixelKeys(profile);
    const groups = {};

    for (const name of Object.keys(profile.matrix.pixelGroups)) {
      groups[name] = resolveService.getPixelsForKeyOrGroup(profile.matrix, allPixels, name).map((pixel) => pixel.key);
    }

    return {
      pixels: allPixels.map(pixelOf),
      groups,
      repeatFor: (input.repeatFor || []).map((repeatFor: string[]) =>
        fixtureService.getPixelsInOrder(profile, repeatFor).map((pixel) => pixel.key)
      ),
    };
  },

  pixelGroup: (input) => {
    const group = new FixtureMatrixPixelGroup(input.group);
    const allPixels = input.pixels.map((pixel: any[]) => {
      const cachedPixel = new CachedFixturePixel();
      [cachedPixel.key, cachedPixel.x, cachedPixel.y, cachedPixel.z] = pixel;
      return cachedPixel;
    });

    try {
      return resolveService.resolveGroupPixels(group, allPixels).map((pixel) => pixel.key);
    } catch (error) {
      // a rule which can't be read stops the whole group on both sides
      return 'error';
    }
  },

  channelValues: (input) => input.runs.map((run: any) => channelValues(input.project, run.preview, run.times)),

  migration: (input) => migratedProjectOf(migrate(input.project)),
};

// the first difference between what was expected and what came out, undefined for none
function difference(expected: any, actual: any, path = ''): string {
  if (typeof expected === 'number' && typeof actual === 'number') {
    // exactly the same number, the sign of a zero aside (JSON writes -0 as 0)
    return expected === actual ? undefined : `${path}: expected ${expected} but was ${actual}`;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      return `${path}: expected ${JSON.stringify(expected)} but was ${JSON.stringify(actual)}`;
    }

    for (let i = 0; i < expected.length; i++) {
      const itemDifference = difference(expected[i], actual[i], `${path}[${i}]`);

      if (itemDifference) {
        return itemDifference;
      }
    }

    return undefined;
  }

  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = Array.from(new Set(Object.keys(expected).concat(Object.keys(actual)))).sort();

    for (const key of keys) {
      if (!(key in expected) || !(key in actual)) {
        return `${path}.${key}: expected ${JSON.stringify(expected[key])} but was ${JSON.stringify(actual[key])}`;
      }

      const propertyDifference = difference(expected[key], actual[key], `${path}.${key}`);

      if (propertyDifference) {
        return propertyDifference;
      }
    }

    return undefined;
  }

  return expected === actual ? undefined : `${path}: expected ${JSON.stringify(expected)} but was ${JSON.stringify(actual)}`;
}

// round trip through JSON, like the values are written and read back
function asWritten(value: any): any {
  return JSON.parse(JSON.stringify(normalize(value)));
}

// npm run conformance:record passes the address to send what came out to
const karmaArgs: string[] = ((window as any).__karma__?.config?.args as string[]) || [];
const recordUrl = karmaArgs[0] === 'conformance-record' ? karmaArgs[1] : undefined;

describe('Conformance with Rocket Show', () => {
  for (const fileName of Object.keys(caseFiles)) {
    const caseFile: CaseFile = caseFiles[fileName];

    describe(fileName, () => {
      it(`runs the ${caseFile.cases.length} cases of the kind ${caseFile.kind} like they are recorded`, async () => {
        const run = kinds[caseFile.kind];

        if (!run) {
          fail('Unknown kind ' + caseFile.kind);
          return;
        }

        const actuals = caseFile.cases.map((conformanceCase) => asWritten(run(conformanceCase.input)));

        if (recordUrl) {
          const response = await fetch(recordUrl, {
            method: 'POST',
            body: JSON.stringify({ fileName, actuals }),
          });
          expect(response.ok).toBe(true);
          return;
        }

        const differences: string[] = [];

        caseFile.cases.forEach((conformanceCase, index) => {
          const caseDifference =
            conformanceCase.expected === undefined ? 'not recorded yet' : difference(conformanceCase.expected, actuals[index]);

          if (caseDifference) {
            differences.push(`${conformanceCase.name}: ${caseDifference}`);
          }
        });

        expect(differences).toEqual([]);
      });
    });
  }
});
