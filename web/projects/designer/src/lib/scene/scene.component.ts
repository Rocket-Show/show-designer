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

    // keep the folders open/closed the way they are right now
    const openScenes = new Map<string, boolean>();
    for (const sceneNode of this.treeNodes) {
      openScenes.set(sceneNode.scene.uuid, sceneNode.expanded);
    }

    for (const scene of this.projectService.project.scenes) {
      const sceneNode: TreeNode = {
        id: scene.uuid,
        isFolder: true,
        expanded: openScenes.get(scene.uuid) !== false,
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

      if (presetNode && !this.projectService.project.previewPreset) {
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

  // the "-" button removes whatever is selected: a preset from its scene or the
  // scene itself
  remove() {
    const presetNode = this.selectedNodes.find((node) => node.preset);

    if (presetNode) {
      this.sceneService.removePresetFromScene(presetNode.scene, presetNode.preset);
      return;
    }

    if (this.sceneService.selectedScenes.length === 0) {
      return;
    }

    this.sceneService.removeScene(this.sceneService.selectedScenes[0]);
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
