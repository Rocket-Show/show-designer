import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { ColorService } from './color.service';
import { EffectService } from './effect.service';
import { FolderService } from './folder.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { UuidService } from './uuid.service';
import { LivePreviewService } from './live-preview.service';

@Injectable({
  providedIn: 'root',
})
export class SceneService {
  selectedScenes: Scene[] = [];

  // the icon a scene is shown with, while none has been picked for it
  static readonly defaultIcon = 'fa-picture-o';

  sceneDeleted: Subject<void> = new Subject<void>();
  sceneSelected: Subject<void> = new Subject<void>();

  // fires, when scenes have been added/removed or their presets have changed
  scenesChanged: Subject<void> = new Subject<void>();

  constructor(
    private uuidService: UuidService,
    private colorService: ColorService,
    private effectService: EffectService,
    private folderService: FolderService,
    private presetService: PresetService,
    private projectService: ProjectService,
    private livePreviewService: LivePreviewService
  ) {}

  // the icon of a scene: the one picked for it, or the default one
  getSceneIcon(scene: Scene): string {
    return scene.icon || SceneService.defaultIcon;
  }

  sceneIsSelected(scene: Scene): boolean {
    for (const selectedScene of this.selectedScenes) {
      if (selectedScene.uuid === scene.uuid) {
        return true;
      }
    }

    return false;
  }

  // all presets of a scene in their layer order: the first one is the topmost
  // layer, overwriting the values of the ones below it
  getScenePresets(scene: Scene): Preset[] {
    const presets: Preset[] = [];

    for (const uuid of scene.presetUuids) {
      const preset = this.presetService.getPresetByUuid(uuid);

      // a preset can only be once in a scene
      if (preset && presets.indexOf(preset) < 0) {
        presets.push(preset);
      }
    }

    return presets;
  }

  addPresetToScene(scene: Scene, preset: Preset, index?: number) {
    if (scene.presetUuids.indexOf(preset.uuid) >= 0) {
      // already in this scene
      return;
    }

    if (index === undefined || index < 0 || index > scene.presetUuids.length) {
      index = scene.presetUuids.length;
    }

    scene.presetUuids.splice(index, 0, preset.uuid);
    this.scenesChanged.next();
    this.livePreviewService.previewLive();
  }

  removePresetFromScene(scene: Scene, preset: Preset) {
    const index = scene.presetUuids.indexOf(preset.uuid);

    if (index < 0) {
      return;
    }

    scene.presetUuids.splice(index, 1);
    this.scenesChanged.next();
    this.livePreviewService.previewLive();
  }

  // remove a preset from all scenes (e.g. after it has been deleted)
  removePresetFromAllScenes(preset: Preset) {
    for (const scene of this.projectService.project.scenes) {
      for (let i = scene.presetUuids.length - 1; i >= 0; i--) {
        if (scene.presetUuids[i] === preset.uuid) {
          scene.presetUuids.splice(i, 1);
        }
      }
    }

    this.scenesChanged.next();
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

  // used to pick something to edit when a project is opened
  selectPresetFromSelectedScene() {
    // select the first preset of the scene, if no preset of the current scene is already
    // selected to make sure, the user does not edit a preset which is not even
    // active in the current scene (and sees no change).

    let firstPresetUuid;

    // check, whether a preset of the current scene is already selected and do nothing
    // in this case
    for (const scene of this.selectedScenes) {
      for (const presetUuid of scene.presetUuids) {
        if (firstPresetUuid === undefined) {
          firstPresetUuid = presetUuid;
        }

        if (presetUuid === this.presetService.selectedPreset?.uuid) {
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
    if (index >= this.projectService.project.scenes.length) {
      this.selectScenes([]);
      return;
    }

    this.selectScenes([this.projectService.project.scenes[index]]);
  }

  // select the passed scenes and, if passed, the preset to be edited inside them
  selectScenes(scenes: Scene[], preset?: Preset) {
    this.effectService.selectedEffect = undefined;
    this.selectedScenes = scenes;

    // only a preset which was clicked changes what is being edited. Selecting a scene
    // leaves it alone, the tab rail names it and the tree only marks it when it is part
    // of a selected scene.
    if (preset) {
      this.presetService.selectPreset(this.projectService.project.presets.indexOf(preset));
    }

    this.projectService.project.selectedSceneUuids = [];
    for (const scene of this.selectedScenes) {
      this.projectService.project.selectedSceneUuids.push(scene.uuid);
    }
    this.presetService.previewSelectionChanged.next();
    this.livePreviewService.previewLive();

    this.sceneSelected.next();
  }

  // add a scene inside the passed folder, right above the passed one (the scene which
  // was clicked last) or at the end of that folder
  addScene(name?: string, folderUuid?: string, above?: Scene): Scene {
    const scene: Scene = new Scene();
    scene.uuid = this.uuidService.getUuid();
    scene.name = name || 'New Scene';

    // the presets decide the color of the scene as soon as one of them sets one. Until
    // then it is marked with a palette color, so the scenes can be told apart.
    scene.color = this.colorService.getNewSceneColor(this.projectService.project.scenes.length);

    if (above && above.folderUuid === folderUuid) {
      scene.folderUuid = folderUuid;
      scene.sortIndex = (above.sortIndex || 0) - 0.5;
    } else {
      this.folderService.placeLast(this.projectService.project.sceneFolders, this.projectService.project.scenes, scene, folderUuid);
    }

    this.projectService.project.scenes.push(scene);
    this.folderService.renumber(this.projectService.project.sceneFolders, this.projectService.project.scenes, folderUuid);
    this.folderService.sortItems(this.projectService.project.sceneFolders, this.projectService.project.scenes);

    this.scenesChanged.next();
    this.selectScenes([scene]);

    return scene;
  }

  removeScene(scene: Scene): void {
    const index = this.projectService.project.scenes.indexOf(scene);

    if (index < 0) {
      return;
    }

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
    this.projectService.project.scenes.splice(index, 1);
    this.folderService.renumber(this.projectService.project.sceneFolders, this.projectService.project.scenes, scene.folderUuid);
    this.scenesChanged.next();

    if (this.projectService.project.scenes.length > 0) {
      this.selectScene(0);
    } else {
      this.selectedScenes = [];
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
