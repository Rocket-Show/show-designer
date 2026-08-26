import { Component, OnInit } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TreeDragService } from '../tree/tree-drag.service';
import { PresetSettingsComponent } from './preset-settings/preset-settings.component';
import type { Options } from 'sortablejs';

@Component({
  selector: 'lib-app-preset',
  templateUrl: './preset.component.html',
  styleUrls: ['./preset.component.css'],
  standalone: false,
})
export class PresetComponent implements OnInit {
  // this list only organizes the presets. Their order does not influence the
  // playback anymore, the scenes define it -> let sortablejs use its own drag
  // implementation, so the presets can be dragged into the scene tree natively
  presetSortableOptions: Options = {
    forceFallback: true,
  };

  constructor(
    public presetService: PresetService,
    public sceneService: SceneService,
    public projectService: ProjectService,
    public introService: IntroService,
    private treeDragService: TreeDragService,
    private modalService: BsModalService
  ) {}

  ngOnInit() {}

  selectPreset(index: number) {
    this.projectService.project.previewPreset = true;
    this.presetService.selectPreset(index);
  }

  // the presets can only be added to/removed from a single selected scene
  private singleSelectedScene(): Scene {
    if (this.sceneService.selectedScenes && this.sceneService.selectedScenes.length === 1) {
      return this.sceneService.selectedScenes[0];
    }

    return undefined;
  }

  enableCheckbox(): boolean {
    return !!this.singleSelectedScene();
  }

  activatePreset(active: boolean, preset: Preset) {
    const scene = this.singleSelectedScene();

    if (!scene) {
      return;
    }

    if (active) {
      // add it as the topmost layer of the scene
      this.sceneService.addPresetToScene(scene, preset, 0);
    } else {
      this.sceneService.removePresetFromScene(scene, preset);
    }
  }

  addPreset() {
    const scene = this.singleSelectedScene();

    // insert the new preset right above the currently selected one, or on top of
    // the scene, if the selected preset is not part of it
    let index = 0;

    if (scene && this.presetService.selectedPreset) {
      index = Math.max(scene.presetUuids.indexOf(this.presetService.selectedPreset.uuid), 0);
    }

    this.presetService.addPreset();

    if (scene) {
      this.sceneService.addPresetToScene(scene, this.presetService.selectedPreset, index);
    }
  }

  removePreset() {
    if (!this.presetService.selectedPreset) {
      return;
    }

    const preset = this.presetService.selectedPreset;

    this.sceneService.removePresetFromAllScenes(preset);
    this.presetService.removePreset(preset);
  }

  // dragging a preset into the scene tree adds it to a scene (it stays in this list)
  onDragStart(preset: Preset, event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      // required for Firefox to start a native drag
      event.dataTransfer.setData('text/plain', preset.name ?? '');
    }

    this.treeDragService.start([{ id: preset.uuid, isFolder: false, preset }]);
  }

  onDragEnd() {
    this.treeDragService.end();
  }

  openSettings(preset: Preset) {
    this.modalService.show(PresetSettingsComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { preset },
    });
  }
}
