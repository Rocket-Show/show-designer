import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AiLooks, AiLooksRequest, AiLooksResponse, AiLooksStatus, AiRig, AiSettings } from '../models/ai-looks';
import { AiCompiled, compileAiLooks, genericStrobePercentage } from '../models/ai-looks-compiler';
import { buildAiRig } from '../models/ai-rig';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { getPositionedCapability, getPropertyRank } from '../models/capability-position';
import { EffectCurve } from '../models/effect-curve';
import { FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Scene } from '../models/scene';
import { ColorService } from './color.service';
import { FixtureService } from './fixture.service';
import { FolderService } from './folder.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';
import { UndoService } from './undo.service';
import { UserService } from './user.service';
import { UuidService } from './uuid.service';

// The AI looks (see ai-looks): asks the API of the online designer for them, for a logged in user, and adds what it
// answers to the project as presets and scenes.
@Injectable({
  providedIn: 'root',
})
export class AiLooksService {
  // what the user picked and got the last time the dialog was open, to start from the next time
  last: { settings: AiSettings; prompt: string; looks: AiLooks };

  constructor(
    private http: HttpClient,
    private userService: UserService,
    private projectService: ProjectService,
    private fixtureService: FixtureService,
    private presetService: PresetService,
    private sceneService: SceneService,
    private folderService: FolderService,
    private colorService: ColorService,
    private timelineService: TimelineService,
    private undoService: UndoService,
    private uuidService: UuidService
  ) {}

  // can the AI looks be used, and how many requests the user has left
  getStatus(): Observable<AiLooksStatus> {
    return this.http.get<AiLooksStatus>('ai-looks', { headers: this.userService.getHeaders() });
  }

  design(request: AiLooksRequest): Observable<AiLooksResponse> {
    return this.http.post<AiLooksResponse>('ai-looks', JSON.stringify(request), {
      headers: (this.userService.getHeaders() || new HttpHeaders()).set('Content-Type', 'application/json'),
    });
  }

  // the fixtures of the project in groups (see ai-rig)
  getRig(): AiRig {
    const project = this.projectService.project;

    return buildAiRig({
      fixtures: project.fixtures,
      presetFixtures: project.presetFixtures,
      fixtureFolders: project.fixtureFolders,
      cachedFixtures: this.fixtureService.cachedFixtures,
      stageHeightCm: project.stageHeightCm,
      stageFloorHeightCm: project.stageFloorHeightCm,
    });
  }

  // the tempo the looks follow at first: the one of the composition open
  getTempo(): number {
    const beatsPerMinute = this.timelineService.selectedComposition?.beatsPerMinute;

    return beatsPerMinute > 0 ? Math.round(beatsPerMinute) : EffectCurve.defaultBeatsPerMinute;
  }

  getRequest(rig: AiRig, settings: AiSettings, prompt: string, current?: AiLooks, instruction?: string): AiLooksRequest {
    const request: AiLooksRequest = { rig: { groups: rig.groups.map((group) => group.group) }, settings, prompt: prompt || '' };

    if (current && instruction) {
      request.current = current;
      request.instruction = instruction;
    }

    return request;
  }

  // The presets and scenes of the looks, added to the project in a folder of the presets and one of the scenes named
  // after them, as one step to undo. The first scene is selected, which previews it, and its topmost preset is edited.
  addToProject(looks: AiLooks, rig: AiRig, bpm: number): AiCompiled {
    const project = this.projectService.project;
    const compiled = compileAiLooks(looks, {
      stageWidthCm: project.stageWidthCm,
      stageDepthCm: project.stageDepthCm,
      stageFloorHeightCm: project.stageFloorHeightCm,
      presetFixtures: project.presetFixtures,
      rig,
      bpm,
      newUuid: () => this.uuidService.getUuid(),
      strobeValues: (fixtureUuids, effect, flashesPerSecond) => this.getStrobeValues(fixtureUuids, effect, flashesPerSecond),
    });

    if (compiled.presets.length === 0) {
      return compiled;
    }

    const name = looks.name || 'AI looks';
    const presetFolder = this.folderService.createFolder(project.presetFolders, project.presets, name);
    const sceneFolder = this.folderService.createFolder(project.sceneFolders, project.scenes, name);

    compiled.presets.forEach((preset, index) => {
      preset.folderUuid = presetFolder.uuid;
      preset.sortIndex = index;
      project.presets.push(preset);
    });

    compiled.scenes.forEach((scene: Scene, index) => {
      scene.folderUuid = sceneFolder.uuid;
      scene.sortIndex = index;
      scene.color = this.colorService.getNewSceneColor(project.scenes.length);
      project.scenes.push(scene);
    });

    this.folderService.sortItems(project.presetFolders, project.presets);
    this.folderService.sortItems(project.sceneFolders, project.scenes);

    this.presetService.presetsChanged.next();
    this.sceneService.scenesChanged.next();

    // the first scene plays, its topmost preset is the one the editor shows
    if (compiled.scenes.length > 0) {
      const first = compiled.scenes[0];
      const preset = compiled.presets.find((candidate) => candidate.uuid === first.presetUuids[0]) || compiled.presets[0];
      this.sceneService.selectScenes([first], preset);
    }

    this.undoService.captureChanges();

    return compiled;
  }

  // The strobe of the fixtures of a preset flashing in an effect, as fast as asked on every model: each model takes its
  // own place in the range of its strobe (and of a channel of its own for the speed), as fast as its profile says it
  // flashes there. A model which doesn't say how fast flashes like one going from 1 to 20 times a second.
  getStrobeValues(fixtureUuids: string[], effect: string, flashesPerSecond: number): FixtureCapabilityValue[] {
    const channelsOfProfiles = new Map<string, CachedFixtureChannel[]>();

    for (const cachedFixture of this.fixtureService.cachedFixtures) {
      if (fixtureUuids.indexOf(cachedFixture.fixture.uuid) < 0) {
        continue;
      }

      const profileUuid = cachedFixture.profile.uuid;

      if (!channelsOfProfiles.has(profileUuid)) {
        channelsOfProfiles.set(profileUuid, []);
      }
      channelsOfProfiles.get(profileUuid).push(...cachedFixture.channels);
    }

    const values: FixtureCapabilityValue[] = [];
    const generic = genericStrobePercentage(flashesPerSecond);

    channelsOfProfiles.forEach((channels, profileUuid) => {
      const strobe = this.getStrobePercentage(channels, FixtureCapabilityType.ShutterStrobe, effect, flashesPerSecond);
      const speed = this.getStrobePercentage(channels, FixtureCapabilityType.StrobeSpeed, effect, flashesPerSecond);
      const strobeValue = new FixtureCapabilityValue({
        type: FixtureCapabilityType.ShutterStrobe,
        profileUuid,
        valuePercentage: strobe ?? speed ?? generic,
      });

      if (effect && effect !== 'Strobe') {
        strobeValue.shutterEffect = effect;
      }

      values.push(
        strobeValue,
        new FixtureCapabilityValue({ type: FixtureCapabilityType.StrobeSpeed, profileUuid, valuePercentage: speed ?? strobe ?? generic })
      );
    });

    return values;
  }

  // where in the range of the capability a channel strobes with (in the effect) it flashes as fast as asked, or
  // undefined if no channel says how fast it flashes
  private getStrobePercentage(
    channels: CachedFixtureChannel[],
    type: FixtureCapabilityType,
    effect: string,
    flashesPerSecond: number
  ): number {
    const words: { [word: string]: number } = { slow: 1, fast: 20 };
    const read = (text: string) => {
      const trimmed = text === undefined || text === null ? undefined : String(text).trim();

      return trimmed === undefined
        ? undefined
        : Object.prototype.hasOwnProperty.call(words, trimmed)
        ? words[trimmed]
        : getPropertyRank(trimmed);
    };

    for (const channel of channels) {
      const channelCapability = getPositionedCapability(
        channel,
        type,
        1,
        undefined,
        type === FixtureCapabilityType.ShutterStrobe ? effect : undefined
      );

      if (!channelCapability || channelCapability.capability.type !== type) {
        continue;
      }

      const capability = channelCapability.capability;
      const start = read(capability.speedStart || capability.speed);
      const end = read(capability.speedEnd || capability.speed);

      if (typeof start === 'number' && typeof end === 'number' && start !== end) {
        const slow = Math.min(start, end);
        const fast = Math.max(start, end);
        const percentage = (flashesPerSecond - slow) / (fast - slow);

        // a strobe at 0 is no strobe at all
        return Math.round(Math.min(Math.max(percentage, 0.01), 1) * 1000) / 1000;
      }
    }

    return undefined;
  }
}
