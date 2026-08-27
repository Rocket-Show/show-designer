import { Component, OnDestroy, OnInit } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { LivePreviewService } from '../services/live-preview.service';
import { SceneService } from '../services/scene.service';
import { TreeDropZone, TreeNode } from '../tree/tree.component';
import { SceneSettingsComponent } from './scene-settings/scene-settings.component';

@Component({
  selector: 'lib-app-scene',
  templateUrl: './scene.component.html',
  styleUrls: ['./scene.component.css'],
  standalone: false,
})
export class SceneComponent implements OnInit, OnDestroy {
  // the scenes with their presets: every scene is a folder, its presets are the
  // children in the order they are layered in (the first one is the topmost layer)
  treeNodes: TreeNode[] = [];
  selectedNodes: TreeNode[] = [];

  private subscriptions: Subscription[] = [];

  // what the trash button acts on: the scene or the preset which was clicked last
  private removeScene: Scene = undefined;
  private removePreset: Preset = undefined;

  constructor(
    public sceneService: SceneService,
    public presetService: PresetService,
    public projectService: ProjectService,
    private modalService: BsModalService,
    private livePreviewService: LivePreviewService,
    public introService: IntroService
  ) {}

  ngOnInit() {
    this.buildTree();

    this.subscriptions.push(
      this.projectService.projectChanged.subscribe(() => this.buildTree()),
      this.sceneService.scenesChanged.subscribe(() => this.buildTree()),
      this.presetService.presetsChanged.subscribe(() => this.buildTree()),
      this.sceneService.sceneSelected.subscribe(() => this.updateSelection()),
      this.presetService.previewSelectionChanged.subscribe(() => this.updateSelection())
    );
  }

  ngOnDestroy() {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  private buildTree() {
    const nodes: TreeNode[] = [];

    for (const scene of this.projectService.project.scenes) {
      const sceneNode: TreeNode = {
        id: scene.uuid,
        isFolder: true,
        expanded: scene.expanded !== false,
        scene,
        children: [],
      };

      for (const preset of this.sceneService.getScenePresets(scene)) {
        sceneNode.children.push({
          id: scene.uuid + '/' + preset.uuid,
          isFolder: false,
          scene,
          preset,
        });
      }

      nodes.push(sceneNode);
    }

    this.treeNodes = nodes;
    this.updateSelection();
  }

  private updateSelection() {
    // mark the currently selected scenes and, inside them, the preset being edited
    const selectedNodes: TreeNode[] = [];

    for (const sceneNode of this.treeNodes) {
      if (!this.sceneService.sceneIsSelected(sceneNode.scene)) {
        continue;
      }

      selectedNodes.push(sceneNode);

      // mark the preset being edited inside the scene as well
      const presetNode = (sceneNode.children ?? []).find((node: TreeNode) => node.preset === this.presetService.selectedPreset);

      if (presetNode) {
        selectedNodes.push(presetNode);
      }
    }

    this.selectedNodes = selectedNodes;
  }

  // scenes stay at the root level, presets only live inside a scene and only once
  allowDrop = (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone): boolean => {
    const draggedScenes = dragged.filter((node) => node.isFolder);
    const draggedPresets = dragged.filter((node) => node.preset);

    if (draggedScenes.length && draggedPresets.length) {
      return false;
    }

    if (draggedScenes.length) {
      return target.isFolder && zone !== 'inside';
    }

    const targetScene: Scene = target.scene;

    if (!targetScene || (zone === 'inside' && !target.isFolder)) {
      return false;
    }

    for (const node of draggedPresets) {
      // moving a preset inside its own scene is fine, adding it a second time is not
      if (node.scene !== targetScene && targetScene.presetUuids.indexOf(node.preset.uuid) >= 0) {
        return false;
      }
    }

    return true;
  };

  onNodesChange(nodes: TreeNode[]) {
    const scenes: Scene[] = [];

    for (const sceneNode of nodes) {
      if (!sceneNode.isFolder) {
        continue;
      }

      const scene: Scene = sceneNode.scene;
      const presetUuids: string[] = [];

      for (const presetNode of sceneNode.children ?? []) {
        // the node moved to another scene -> let it point to its new one
        presetNode.scene = scene;
        presetNode.id = scene.uuid + '/' + presetNode.preset.uuid;

        if (presetUuids.indexOf(presetNode.preset.uuid) < 0) {
          presetUuids.push(presetNode.preset.uuid);
        }
      }

      scene.presetUuids = presetUuids;
      scenes.push(scene);
    }

    this.projectService.project.scenes = scenes;

    // rebuilds the tree through the subscription above
    this.sceneService.scenesChanged.next();
    this.livePreviewService.previewLive();
  }

  // a row was clicked -> it becomes what the trash button acts on
  onActivate(node: TreeNode) {
    this.removeScene = node.scene;
    this.removePreset = node.preset;
  }

  onSelectedNodesChange(nodes: TreeNode[]) {
    const scenes: Scene[] = [];
    let preset: Preset = undefined;

    for (const node of nodes) {
      if (node.scene && scenes.indexOf(node.scene) < 0) {
        scenes.push(node.scene);
      }
      if (node.preset && !preset) {
        preset = node.preset;
      }
    }

    this.selectedNodes = nodes;
    this.sceneService.selectScenes(scenes, preset);
  }

  // opening and closing a scene is remembered with the project
  onNodeExpandedChange(node: TreeNode) {
    node.scene.expanded = node.expanded;
  }

  // one button for both directions: collapse everything, or open it up again once
  // everything is closed
  allScenesCollapsed(): boolean {
    return !this.projectService.project.scenes.some((scene) => scene.expanded !== false);
  }

  switchAllScenesCollapsed() {
    const expanded = this.allScenesCollapsed();

    for (const scene of this.projectService.project.scenes) {
      scene.expanded = expanded;
    }

    this.buildTree();
  }

  // the trash button removes whatever is selected: a preset from its scene or the
  // scene itself
  removeLabel(): string {
    return this.removePreset ? 'designer.scene.remove-preset' : 'designer.scene.remove';
  }

  remove() {
    if (this.removePreset && this.removeScene) {
      this.sceneService.removePresetFromScene(this.removeScene, this.removePreset);
      this.removePreset = undefined;
      return;
    }

    const scene = this.removeScene || this.sceneService.selectedScenes[0];

    if (!scene) {
      return;
    }

    this.sceneService.removeScene(scene);
    this.removeScene = undefined;
  }

  openSettings(scene: Scene) {
    this.modalService.show(SceneSettingsComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { scene },
    });
  }
}
