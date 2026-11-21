import { Injectable, OnDestroy } from '@angular/core';
import { CachedFixture } from '../models/cached-fixture';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { AudioFrames } from '../models/pixel-audio';
import { Project } from '../models/project';
import { CompileCode, EngineShow, LightingEngine, loadLightingEngine } from '../engine/lighting-engine';
import { ConfigService } from './config.service';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';

// how the engine stands: not asked for, being loaded, ready, or not to be had (engine.wasm is not there)
export type EngineState = 'off' | 'loading' | 'ready' | 'missing';

// A difference between the two engines: where, and the value each of them came to (undefined: none)
export interface EngineDifference {
  timeMillis: number;
  // the fixture (with its pixel) and the channel, or the universe and the DMX channel (from 1)
  place: string;
  typeScript: number;
  engine: number;
}

// what a comparison of the two engines came to
export interface EngineComparison {
  frames: number;
  values: number;
  // the differences beyond 1 (of the unit of the channel), the largest first, at most maxDifferences
  differences: EngineDifference[];
  differenceCount: number;
  // the largest difference within the values both have
  largest: number;
}

// the parts of a project which say what the designer previews rather than what the show is: the engine is told them
// with each frame, so a change of them doesn't compile the project again. The master dimmer is the engine's master
// dimmer of the host (the compiled show keeps it at full).
const previewKeys = [
  'id',
  'shareToken',
  'selectedPresetUuid',
  'selectedSceneUuids',
  'selectedStepUuid',
  'previewPreset',
  'stepPreviewRunning',
  'stepPreviewStartMillis',
  'identifyFixtureUuids',
  'resetFixtureUuids',
  'lampOnFixtureUuids',
  'dmxOverrides',
  'previewHolds',
  'previewHolding',
  'masterDimmerValue',
];

// how many frames of audio the engine is handed back from the moment of a frame (6 s, what it keeps)
const audioHistoryFrames = 300;
const audioFrameMillis = 20;

// The preview played by the shared lighting engine (engine.wasm, see docs/lighting-engine.md) instead of the
// TypeScript engine of PreviewService, behind the switch ConfigService.sharedEngine. The project is compiled again
// whenever it changes, on the frame after the change; each frame tells the engine what the designer previews (the
// timeline playing, the preset being edited, the selected scenes, the identified fixtures, the faders) and reads the
// values of every channel of every part, for the 3D preview, and the universes, for the DMX channels.
@Injectable({
  providedIn: 'root',
})
export class EnginePreviewService implements OnDestroy {
  // the most differences a comparison keeps
  static maxDifferences = 50;

  state: EngineState = 'off';

  // why the project can't be played by the engine (it can't be compiled), if it can't
  unplayable: string;

  // how long the last compile took (in ms), with the JSON of the project
  compileMillis: number;

  private engine: LightingEngine;
  private loading: Promise<LightingEngine>;
  private show: EngineShow;

  // the project the show was compiled from: the project itself, its JSON without the parts of the preview and the
  // profiles it was compiled with
  private compiledProject: Project;
  private compiledSignature: string;
  private compiledProfiles: any[];
  private compiledProfileCount: number;

  // which part of the show each part of the designer is (by the parts of the fixture service they were found for)
  private partsOf: CachedFixture[];
  private parts = new Map<CachedFixture, number>();

  // what the show plays: the composition of the timeline playing (-1: the preview)
  private playingComposition: number;

  // the audio handed to the engine: whose frames, and up to which
  private audioSource: AudioFrames;
  private audioNewest: number;

  // the values the last frame came to, see playsFrame
  private lastValues: Map<CachedFixture, FixtureChannelValue[]>;

  constructor(
    private configService: ConfigService,
    private projectService: ProjectService,
    private fixtureService: FixtureService,
    private presetService: PresetService,
    private sceneService: SceneService,
    private timelineService: TimelineService
  ) {}

  private get project(): Project {
    return this.projectService.project;
  }

  // Turn the switch on or off. On, engine.wasm is loaded the first time; the TypeScript engine plays until it is
  // there, and on if it isn't.
  setOn(on: boolean) {
    this.configService.sharedEngine = on;

    if (on) {
      this.load();
    } else {
      this.forgetShow();
    }
  }

  // engine.wasm, loaded once (again after it could not be)
  load(): Promise<LightingEngine> {
    if (!this.loading) {
      this.state = 'loading';
      this.loading = loadLightingEngine(this.configService.engineUrl).then(
        (engine) => {
          this.engine = engine;
          this.state = 'ready';
          return engine;
        },
        (error) => {
          this.loading = undefined;
          this.state = 'missing';
          console.warn('The shared lighting engine is not there, the preview plays with the TypeScript engine', error);
          return undefined;
        }
      );
    }

    return this.loading;
  }

  // use an engine already loaded (e.g. by a test)
  useEngine(engine: LightingEngine) {
    this.forgetShow();
    this.engine = engine;
    this.loading = Promise.resolve(engine);
    this.state = 'ready';
  }

  // does the engine play the preview (the switch on, and engine.wasm there)?
  get playing(): boolean {
    return this.configService.sharedEngine && this.state === 'ready';
  }

  // Compile the project again on the next frame, whatever changed (a change the project's JSON doesn't show)
  invalidate() {
    this.compiledSignature = undefined;
  }

  // the JSON the project is compiled from: without the parts of the preview
  private projectJson(project: Project, withProfiles: boolean): string {
    const copy = { ...project };

    for (const key of previewKeys) {
      delete copy[key];
    }

    if (!withProfiles) {
      delete copy.fixtureProfiles;
    }

    return JSON.stringify(copy);
  }

  // The show of the project as it is now: compiled again if anything of it changed since. Undefined if it can't be
  // played by the engine.
  private currentShow(): EngineShow {
    const project = this.project;

    if (!project || !this.engine) {
      return undefined;
    }

    // (the profiles weigh the most and change the least: they are looked at by their list)
    const profiles = project.fixtureProfiles || [];
    const signature = this.projectJson(project, false);

    if (
      project !== this.compiledProject ||
      signature !== this.compiledSignature ||
      profiles !== this.compiledProfiles ||
      profiles.length !== this.compiledProfileCount
    ) {
      this.compile(project, signature, profiles);
    }

    if (this.show && this.partsOf !== this.fixtureService.cachedFixtures) {
      this.findParts();
    }

    return this.show;
  }

  private compile(project: Project, signature: string, profiles: any[]) {
    this.forgetShow();
    this.compiledProject = project;
    this.compiledSignature = signature;
    this.compiledProfiles = profiles;
    this.compiledProfileCount = profiles.length;

    const started = performance.now();
    const compiled = this.engine.compile(this.projectJson(project, true));

    if (compiled.code !== CompileCode.show) {
      this.compileMillis = performance.now() - started;

      if (this.unplayable !== compiled.message) {
        console.warn(
          'The shared lighting engine can not play the project, the preview plays with the TypeScript engine:',
          compiled.message
        );
      }

      this.unplayable = compiled.message || 'code ' + compiled.code;
      return;
    }

    this.unplayable = undefined;
    this.show = this.engine.play(compiled.show, compiled.index, 0);
    this.compileMillis = performance.now() - started;
  }

  private forgetShow() {
    if (this.show) {
      this.show.free();
    }

    this.show = undefined;
    this.compiledProject = undefined;
    this.compiledSignature = undefined;
    this.partsOf = undefined;
    this.playingComposition = undefined;
    this.audioSource = undefined;
    this.lastValues = undefined;
  }

  // which part of the show each part of the designer is: a fixture by its uuid, a pixel by it and its key
  private findParts() {
    const index = this.show.index;
    const byKey = new Map<string, number>();

    index.parts.forEach((part, number) => {
      const key = index.fixtures[part.fixture] + (part.pixelKey === null || part.pixelKey === undefined ? '' : '/' + part.pixelKey);

      // (the first part of a key is the one found by it)
      if (!byKey.has(key)) {
        byKey.set(key, number);
      }
    });

    this.parts.clear();

    for (const cachedFixture of this.fixtureService.cachedFixtures) {
      const part = byKey.get(cachedFixture.fixture.uuid + (cachedFixture.pixel ? '/' + cachedFixture.pixel.key : ''));

      if (part !== undefined) {
        this.parts.set(cachedFixture, part);
      }
    }

    this.partsOf = this.fixtureService.cachedFixtures;
  }

  // Tell the engine what the designer previews now. False if it can't play it (a composition it doesn't know).
  private setInputs(show: EngineShow, timeMillis: number, audio: AudioFrames): boolean {
    const project = this.project;
    const index = show.index;

    if (this.timelineService.playState === 'playing') {
      const composition = this.timelineService.selectedComposition;
      const number = composition ? index.compositions.findIndex((candidate) => candidate.uuid === composition.uuid) : -1;

      if (number < 0) {
        return false;
      }

      // (playing it again starts what follows the beat over)
      if (this.playingComposition !== number) {
        show.playTimeline(number);
        this.playingComposition = number;
      }

      show.setHolds(this.timelineService.holds || []);
    } else {
      this.playingComposition = -1;
      show.playPreview(project.previewPreset);

      const selectedPreset = this.presetService.selectedPreset;
      const preset = selectedPreset ? index.presets.indexOf(selectedPreset.uuid) : -1;
      const selectedStep = this.presetService.selectedStep;
      const step = preset >= 0 && selectedStep ? (index.steps[preset] || []).indexOf(selectedStep.uuid) : -1;
      show.selectPreset(preset, step, project.stepPreviewRunning ? project.stepPreviewStartMillis || 0 : undefined);

      const scenes: number[] = [];

      for (const scene of this.sceneService.selectedScenes || []) {
        const number = index.scenes.indexOf(scene.uuid);

        if (number >= 0) {
          scenes.push(number);
        }
      }

      show.selectScenes(scenes);
      show.setHolds([]);
    }

    const identify = project.identifyFixtureUuids || [];
    const reset = project.resetFixtureUuids || [];
    const lampOn = project.lampOnFixtureUuids || [];

    index.fixtures.forEach((uuid, fixture) =>
      show.markFixture(fixture, identify.indexOf(uuid) >= 0, reset.indexOf(uuid) >= 0, lampOn.indexOf(uuid) >= 0)
    );

    const overrides: { universe: number; dmxChannel: number; value: number }[] = [];

    for (const dmxOverride of project.dmxOverrides || []) {
      const universe = index.universes.indexOf(dmxOverride.universeUuid);

      if (universe >= 0) {
        overrides.push({ universe, dmxChannel: dmxOverride.dmxChannel, value: dmxOverride.value });
      }
    }

    show.setOverrides(overrides);
    show.setMasterDimmer(project.masterDimmerValue === undefined || project.masterDimmerValue === null ? 1 : project.masterDimmerValue);
    this.feedAudio(show, timeMillis, audio);
    return true;
  }

  // Hand the engine the frames of the audio up to the moment of a frame: the ones it doesn't have yet, all of the
  // last 6 s after a jump or for other audio
  private feedAudio(show: EngineShow, timeMillis: number, audio: AudioFrames) {
    const current = Math.floor(Math.max(timeMillis, 0) / audioFrameMillis);

    if (!audio) {
      if (this.audioSource) {
        show.clearAudio();
        this.audioSource = undefined;
      }

      return;
    }

    let first = Math.max(current - audioHistoryFrames, 0);

    if (audio === this.audioSource && this.audioNewest <= current && this.audioNewest >= first) {
      first = this.audioNewest + 1;
    } else {
      show.clearAudio();
    }

    for (let frame = first; frame <= current; frame++) {
      const values = audio(frame);

      if (values) {
        show.audioFrame(frame, values);
      }
    }

    this.audioSource = audio;
    this.audioNewest = current;
  }

  // The values of every channel of every part of the designer at a moment (like PreviewService.getChannelValues),
  // worked out by the engine: undefined if it doesn't play the preview, or can't play what is previewed
  getChannelValues(timeMillis: number, audio?: AudioFrames): Map<CachedFixture, FixtureChannelValue[]> {
    if (!this.playing) {
      return undefined;
    }

    const show = this.currentShow();

    if (!show || !this.setInputs(show, timeMillis, audio)) {
      return undefined;
    }

    show.render(timeMillis);

    const { values, flags } = show.values();
    const result = new Map<CachedFixture, FixtureChannelValue[]>();

    for (const cachedFixture of this.fixtureService.cachedFixtures) {
      const fixtureValues: FixtureChannelValue[] = [];
      const part = this.parts.get(cachedFixture);

      if (part !== undefined) {
        const channels = show.index.parts[part].channels;
        const base = show.valueBases[part];
        const seen = new Set<string>();

        for (let channel = 0; channel < channels.length; channel++) {
          // (the first channel of a name is the one found by the name)
          if (flags[base + channel] & 1 && !seen.has(channels[channel])) {
            seen.add(channels[channel]);
            const value = new FixtureChannelValue();
            value.channelName = channels[channel];
            value.profileUuid = cachedFixture.profile.uuid;
            value.value = values[base + channel];
            fixtureValues.push(value);
          }
        }
      }

      result.set(cachedFixture, fixtureValues);
    }

    this.lastValues = result;
    return result;
  }

  // were these the values of the last frame of the engine (the universes of the same frame are there)?
  playedFrame(values: Map<CachedFixture, FixtureChannelValue[]>): boolean {
    return !!values && values === this.lastValues && !!this.show && !this.show.freed;
  }

  // The 512 values sent on a universe in the last frame of the engine, undefined for a universe of no fixture of the
  // show (nothing is sent there but the faders)
  getUniverse(universeUuid: string): number[] {
    if (!this.show || this.show.freed) {
      return undefined;
    }

    const universe = this.show.universe(this.show.index.universes.indexOf(universeUuid === undefined ? '' : universeUuid));
    return universe ? Array.prototype.slice.call(universe) : undefined;
  }

  // Compare the engine with the TypeScript engine at the passed moments: the values of every channel of every part,
  // and the universes they send. A value which only one of them has, or which differs by more than 1, is a
  // difference.
  compare(
    timesMillis: number[],
    typeScript: (timeMillis: number) => Map<CachedFixture, FixtureChannelValue[]>,
    typeScriptUniverse: (universeUuid: string, values: Map<CachedFixture, FixtureChannelValue[]>) => number[],
    audio?: (timeMillis: number) => AudioFrames
  ): EngineComparison {
    const comparison: EngineComparison = { frames: 0, values: 0, differences: [], differenceCount: 0, largest: 0 };

    const differ = (timeMillis: number, place: string, typeScriptValue: number, engineValue: number) => {
      comparison.values++;

      if (typeScriptValue === undefined && engineValue === undefined) {
        return;
      }

      const difference = typeScriptValue === undefined || engineValue === undefined ? Infinity : Math.abs(typeScriptValue - engineValue);

      if (difference !== Infinity) {
        comparison.largest = Math.max(comparison.largest, difference);
      }

      if (difference > 1) {
        comparison.differenceCount++;
        comparison.differences.push({ timeMillis, place, typeScript: typeScriptValue, engine: engineValue });
      }
    };

    for (const timeMillis of timesMillis) {
      const engineValues = this.getChannelValues(timeMillis, audio ? audio(timeMillis) : undefined);

      if (!engineValues) {
        break;
      }

      const engineUniverses = new Map<string, number[]>();

      for (const universeUuid of this.show.index.universes) {
        engineUniverses.set(universeUuid, this.getUniverse(universeUuid));
      }

      const typeScriptValues = typeScript(timeMillis);
      comparison.frames++;

      typeScriptValues.forEach((values, cachedFixture) => {
        const place =
          (cachedFixture.fixture.name || cachedFixture.fixture.uuid) + (cachedFixture.pixel ? ' / ' + cachedFixture.pixel.key : '');
        const engineByName = new Map<string, number>();

        for (const value of engineValues.get(cachedFixture) || []) {
          engineByName.set(value.channelName, value.value);
        }

        const typeScriptByName = new Map<string, number>();

        for (const value of values) {
          if (!typeScriptByName.has(value.channelName)) {
            typeScriptByName.set(value.channelName, value.value);
          }
        }

        typeScriptByName.forEach((value, name) => differ(timeMillis, place + ': ' + name, value, engineByName.get(name)));
        engineByName.forEach((value, name) => {
          if (!typeScriptByName.has(name)) {
            differ(timeMillis, place + ': ' + name, undefined, value);
          }
        });
      });

      engineUniverses.forEach((engineUniverse, universeUuid) => {
        const typeScriptValues512 = typeScriptUniverse(universeUuid || undefined, typeScriptValues);

        for (let channel = 0; channel < 512; channel++) {
          differ(
            timeMillis,
            'universe ' + (universeUuid || '-') + ' / DMX ' + (channel + 1),
            typeScriptValues512[channel],
            engineUniverse ? engineUniverse[channel] : 0
          );
        }
      });
    }

    comparison.differences.sort((a, b) => this.size(b) - this.size(a));
    comparison.differences = comparison.differences.slice(0, EnginePreviewService.maxDifferences);
    return comparison;
  }

  private size(difference: EngineDifference): number {
    return difference.typeScript === undefined || difference.engine === undefined
      ? Number.MAX_VALUE
      : Math.abs(difference.typeScript - difference.engine);
  }

  ngOnDestroy() {
    this.forgetShow();
  }
}
