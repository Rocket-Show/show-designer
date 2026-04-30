import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { EffectService } from './effect.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { UuidService } from './uuid.service';
import { LivePreviewService } from './live-preview.service';

@Injectable({
  providedIn: 'root',
})
export class SceneService {
  selectedScenes: Scene[] = [];
  sceneColors: string[] = ['#945fda', '#61da5f', '#5fc3da', '#dad65f', '#da5f5f', '#246db7'];

  multipleSelection = false;

  sceneDeleted: Subject<void> = new Subject<void>();
  sceneSelected: Subject<void> = new Subject<void>();

  constructor(
    private uuidService: UuidService,
    private effectService: EffectService,
    private presetService: PresetService,
    private projectService: ProjectService,
    private livePreviewService: LivePreviewService
  ) {}

  sceneIsSelected(scene: Scene): boolean {
    for (const selectedScene of this.selectedScenes) {
      if (selectedScene.uuid === scene.uuid) {
        return true;
      }
    }

    return false;
  }

  presetIsSelected(preset: Preset): boolean {
    if (!this.selectedScenes || this.selectedScenes.length !== 1) {
      return false;
    }

    for (const uuid of this.selectedScenes[0].presetUuids) {
      if (preset.uuid === uuid) {
        return true;
      }
    }

    return false;
  }

  switchSceneSelection(scene: Scene) {
    // Select a scene if not yet selected or unselect it otherwise
    if (this.sceneIsSelected(scene)) {
      for (let i = 0; i < this.selectedScenes.length; i++) {
        if (this.selectedScenes[i].uuid === scene.uuid) {
          this.selectedScenes.splice(i, 1);
          return;
        }
      }
    } else {
      this.selectedScenes.push(scene);
    }

    this.sceneSelected.next();
  }

  selectPresetFromSelectedScene() {
    // select the first preset of the scene, if no preset of the current scene is already
    // selected to make sure, the user does not edit a preset which is not even
    // active in the current scene (and sees no change).

    let firstPresetUuid;

    // check, whether a preset of the current scene is already selected and do nothing
    // in this case
    for (const scene of this.selectedScenes) {
      for (const presetUuid of scene.presetUuids) {
        firstPresetUuid = presetUuid;

        if (presetUuid === this.presetService.selectedPreset.uuid) {
          // a preset of a currently selected scene is already selected -> do nothing
          return;
        }
      }
    }

    if (!firstPresetUuid) {
      return;
    }

    for (let i = 0; i < this.projectService.project.presets.length; i++) {
      if (this.projectService.project.presets[i].uuid === firstPresetUuid) {
        this.presetService.selectPreset(i);
        break;
      }
    }
  }

  selectScene(index: number) {
    this.effectService.selectedEffect = undefined;

    if (index >= this.projectService.project.scenes.length) {
      this.selectedScenes = [];
    } else {
      if (this.multipleSelection) {
        this.switchSceneSelection(this.projectService.project.scenes[index]);
      } else {
        this.selectedScenes = [];
        this.selectedScenes.push(this.projectService.project.scenes[index]);
      }
    }

    this.selectPresetFromSelectedScene();

    // preview the complete scene
    this.projectService.project.previewPreset = false;

    this.projectService.project.selectedSceneUuids = [];
    for (const scene of this.selectedScenes) {
      this.projectService.project.selectedSceneUuids.push(scene.uuid);
    }
    this.presetService.previewSelectionChanged.next();
    this.livePreviewService.previewLive();

    this.sceneSelected.next();
  }

  addScene(name?: string): void {
    const scene: Scene = new Scene();
    scene.uuid = this.uuidService.getUuid();
    scene.name = name || 'New Scene';

    if (this.projectService.project.scenes.length < this.sceneColors.length) {
      scene.color = this.sceneColors[this.projectService.project.scenes.length];
    } else {
      scene.color = '#' + Math.random().toString(16).slice(2, 8).toUpperCase();
    }

    // Insert the new scene before the highest currently selected scene
    let highestSelectedSceneIndex = 0;

    for (let i = 0; i < this.projectService.project.scenes.length; i++) {
      if (this.sceneIsSelected(this.projectService.project.scenes[i])) {
        highestSelectedSceneIndex = i;
        break;
      }
    }

    this.projectService.project.scenes.splice(highestSelectedSceneIndex, 0, scene);
    this.selectScene(highestSelectedSceneIndex);
  }

  removeScene(scene: Scene): void {
    // remove all playback regions
    for (const composition of this.projectService.project.compositions) {
      for (let i = composition.scenePlaybackRegions.length - 1; i >= 0; i--) {
        const compositionPlaybackRegion = composition.scenePlaybackRegions[i];
        if (compositionPlaybackRegion.sceneUuid === scene.uuid) {
          composition.scenePlaybackRegions.splice(i, 1);
        }
      }
    }

    // remove the scene
    this.projectService.project.scenes.splice(this.projectService.project.scenes.indexOf(scene), 1);
    if (this.projectService.project.scenes.length > 0) {
      this.selectScene(0);
    }

    this.sceneDeleted.next();
  }

  getSceneByUuid(uuid: string): Scene {
    for (const scene of this.projectService.project.scenes) {
      if (scene.uuid === uuid) {
        return scene;
      }
    }
  }
}
