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

  // the row which was clicked last, marked apart from the selection: it is what the
  // trash button acts on
  focusedNode: TreeNode = undefined;

  private subscriptions: Subscription[] = [];

  // what the trash button acts on: the scene or the preset which was clicked last
  private targetScene: Scene = undefined;
  private targetPreset: Preset = undefined;

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
      // a preset picked in the preset list has to take the mark off the tree
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
        icon: 'fa-picture-o',
        scene,
        children: [],
      };

      for (const preset of this.sceneService.getScenePresets(scene)) {
        sceneNode.children.push({
          id: scene.uuid + '/' + preset.uuid,
          isFolder: false,
          icon: 'fa-lightbulb-o',
          scene,
          preset,
        });
      }

      nodes.push(sceneNode);
    }

    this.treeNodes = nodes;
    this.updateSelection();
  }

  // the tree marks the scenes which are played and the row which was clicked last.
  // Which preset is being edited is not derived here: it is named along the tab rail
  // and marked in the preset list, so it does not come and go with the scene selection.
  private updateSelection() {
    this.updateFocusedNode();

    const selectedNodes: TreeNode[] = [];

    for (const sceneNode of this.treeNodes) {
      if (this.sceneService.sceneIsSelected(sceneNode.scene)) {
        selectedNodes.push(sceneNode);
      }
    }

    if (this.focusedNode && selectedNodes.indexOf(this.focusedNode) < 0) {
      selectedNodes.push(this.focusedNode);
    }

    this.selectedNodes = selectedNodes;
  }

  // all presets a dragged node stands for: a preset itself, or everything inside a
  // folder dragged in from the preset tree
  private draggedPresets(node: TreeNode): Preset[] {
    if (node.preset) {
      return [node.preset];
    }

    const presets: Preset[] = [];

    for (const child of node.children ?? []) {
      presets.push(...this.draggedPresets(child));
    }

    return presets;
  }

  // scenes stay at the root level, presets only live inside a scene and only once
  allowDrop = (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone): boolean => {
    const draggedScenes = dragged.filter((node) => node.scene && node.isFolder);
    const presets = dragged.reduce((all: Preset[], node) => all.concat(this.draggedPresets(node)), []);

    if (draggedScenes.length && presets.length) {
      return false;
    }

    if (draggedScenes.length) {
      return target.isFolder && zone !== 'inside';
    }

    if (!presets.length) {
      return false;
    }

    const targetScene: Scene = target.scene;

    if (!targetScene || (zone === 'inside' && !target.isFolder)) {
      return false;
    }

    for (const node of dragged) {
      // moving a preset inside its own scene is fine, adding it a second time is not
      if (node.scene === targetScene) {
        continue;
      }

      for (const preset of this.draggedPresets(node)) {
        if (targetScene.presetUuids.indexOf(preset.uuid) >= 0) {
          return false;
        }
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
        // a folder dragged in from the preset tree stands for all presets inside it
        for (const preset of this.draggedPresets(presetNode)) {
          if (presetUuids.indexOf(preset.uuid) < 0) {
            presetUuids.push(preset.uuid);
          }
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

  // a row was clicked -> it becomes what the trash button acts on. updateSelection()
  // runs right after this, through the scene selection.
  onActivate(node: TreeNode) {
    this.targetScene = node.scene;
    this.targetPreset = node.preset;
  }

  private updateFocusedNode() {
    // a preset picked somewhere else takes the mark off the one clicked here, so the
    // tree never keeps marking a preset which is not the one being edited
    if (this.targetPreset && this.targetPreset !== this.presetService.selectedPreset) {
      this.targetPreset = undefined;
    }

    this.focusedNode = undefined;

    for (const sceneNode of this.treeNodes) {
      if (sceneNode.scene !== this.targetScene) {
        continue;
      }

      const presetNode = (sceneNode.children ?? []).find((node: TreeNode) => node.preset === this.targetPreset);
      this.focusedNode = presetNode || sceneNode;
      return;
    }
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
    return this.targetPreset ? 'designer.scene.remove-preset' : 'designer.scene.remove';
  }

  remove() {
    if (this.targetPreset && this.targetScene) {
      this.sceneService.removePresetFromScene(this.targetScene, this.targetPreset);
      this.targetPreset = undefined;
      return;
    }

    const scene = this.targetScene || this.sceneService.selectedScenes[0];

    if (!scene) {
      return;
    }

    this.sceneService.removeScene(scene);
    this.targetScene = undefined;
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
