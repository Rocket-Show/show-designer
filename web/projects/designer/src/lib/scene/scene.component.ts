import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { Folder } from '../models/folder';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { ColorService } from '../services/color.service';
import { FolderService } from '../services/folder.service';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { LivePreviewService } from '../services/live-preview.service';
import { SceneService } from '../services/scene.service';
import { TreeDropZone, TreeNode } from '../tree/tree.component';
import { PresetSettingsComponent } from '../preset/preset-settings/preset-settings.component';
import { SceneSettingsComponent } from './scene-settings/scene-settings.component';

@Component({
  selector: 'lib-app-scene',
  templateUrl: './scene.component.html',
  styleUrls: ['./scene.component.css'],
  standalone: false,
})
export class SceneComponent implements OnInit, OnDestroy {
  // the scenes with their presets, grouped in folders: every scene is a folder of the
  // tree, its presets are the children in the order they are layered in (the first one
  // is the topmost layer)
  treeNodes: TreeNode[] = [];
  selectedNodes: TreeNode[] = [];

  // the row which was clicked last, marked apart from the selection: it is what the
  // trash button acts on
  focusedNode: TreeNode = undefined;

  private subscriptions: Subscription[] = [];

  // what the trash button acts on: the folder, scene or preset which was clicked last
  private targetFolder: Folder = undefined;
  private targetScene: Scene = undefined;
  private targetPreset: Preset = undefined;

  constructor(
    public sceneService: SceneService,
    public presetService: PresetService,
    public projectService: ProjectService,
    private colorService: ColorService,
    private folderService: FolderService,
    private translateService: TranslateService,
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
      this.presetService.previewSelectionChanged.subscribe(() => this.updateSelection()),
      // the color picker of the fixtures changes what the presets and their scenes are
      // marked with
      this.presetService.capabilityValuesChanged.subscribe(() => this.updateColors())
    );
  }

  ngOnDestroy() {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  private buildTree() {
    this.treeNodes = this.buildNodes(undefined);
    this.updateSelection();
  }

  private buildNodes(parentUuid: string): TreeNode[] {
    const nodes: TreeNode[] = [];
    const children = this.folderService.getChildren(
      this.projectService.project.sceneFolders,
      this.projectService.project.scenes,
      parentUuid
    );

    for (const child of children) {
      if (child.folder) {
        nodes.push({
          id: child.folder.uuid,
          isFolder: true,
          expanded: child.folder.expanded !== false,
          icon: 'fa-folder-o',
          iconOpen: 'fa-folder-open-o',
          toggleOnClick: true,
          // named apart from the folders of the preset tree, whose nodes are dragged in
          // here and stand for the presets inside them
          sceneFolder: child.folder,
          children: this.buildNodes(child.folder.uuid),
        });

        continue;
      }

      const scene = child.item as Scene;
      const sceneNode: TreeNode = {
        id: scene.uuid,
        isFolder: true,
        expanded: scene.expanded !== false,
        icon: this.sceneService.getSceneIcon(scene),
        iconColor: this.colorService.getSceneColor(scene),
        scene,
        children: [],
      };

      for (const preset of this.sceneService.getScenePresets(scene)) {
        sceneNode.children.push({
          id: scene.uuid + '/' + preset.uuid,
          isFolder: false,
          icon: this.presetService.getPresetIcon(preset),
          iconColor: this.colorService.getPresetColor(preset),
          scene,
          preset,
        });
      }

      nodes.push(sceneNode);
    }

    return nodes;
  }

  // the tree marks the scenes which are played and the row which was clicked last.
  // Which preset is being edited is not derived here: it is named along the tab rail
  // and marked in the preset list, so it does not come and go with the scene selection.
  private updateSelection() {
    this.updateFocusedNode();

    const selectedNodes: TreeNode[] = [];

    this.eachNode(this.treeNodes, (node) => {
      if (node.scene && node.isFolder && this.sceneService.sceneIsSelected(node.scene)) {
        selectedNodes.push(node);
      }
    });

    // the preset which was clicked is filled as well, so the row being edited stands out
    // inside its scene. A folder is never played, it only gets the ring - and filling it
    // would make it part of every drag, so nothing could be dragged into it.
    if (this.focusedNode?.preset && selectedNodes.indexOf(this.focusedNode) < 0) {
      selectedNodes.push(this.focusedNode);
    }

    this.selectedNodes = selectedNodes;
  }

  // the colors follow what the presets put on their fixtures, which changes with every
  // mouse move on the color picker -> repaint the icons instead of rebuilding the tree
  private updateColors() {
    this.eachNode(this.treeNodes, (node) => {
      if (node.preset) {
        node.iconColor = this.colorService.getPresetColor(node.preset);
      } else if (node.scene) {
        node.iconColor = this.colorService.getSceneColor(node.scene);
      }
    });
  }

  private eachNode(nodes: TreeNode[], callback: (node: TreeNode) => void) {
    for (const node of nodes) {
      callback(node);
      this.eachNode(node.children ?? [], callback);
    }
  }

  private findNode(nodes: TreeNode[], matches: (node: TreeNode) => boolean): TreeNode {
    for (const node of nodes) {
      if (matches(node)) {
        return node;
      }

      const found = this.findNode(node.children ?? [], matches);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  // all presets a dragged node stands for: a preset itself, or everything inside a
  // folder dragged in from the preset tree
  private draggedPresets(node: TreeNode): Preset[] {
    if (node.preset) {
      return [node.preset];
    }

    // a scene and a folder of scenes stand for themselves, not for the presets played
    // inside them
    if (node.scene || node.sceneFolder) {
      return [];
    }

    const presets: Preset[] = [];

    for (const child of node.children ?? []) {
      presets.push(...this.draggedPresets(child));
    }

    return presets;
  }

  // scenes and their folders are the structure of the tree, presets only live inside a
  // scene and only once
  allowDrop = (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone): boolean => {
    const structure = dragged.filter((node) => node.sceneFolder || (node.scene && node.isFolder));
    const presets = dragged.reduce((all: Preset[], node) => all.concat(this.draggedPresets(node)), []);

    if (structure.length && presets.length) {
      return false;
    }

    if (structure.length) {
      // a scene or a folder of scenes goes next to another one, or into a folder
      return zone === 'inside' ? !!target.sceneFolder : !!(target.sceneFolder || (target.scene && target.isFolder));
    }

    if (!presets.length) {
      return false;
    }

    const targetScene: Scene = target.scene;

    if (!targetScene) {
      return false;
    }

    // a preset lives inside a scene: drop it onto the scene itself, or next to one of
    // its presets. Between two scenes it would belong to none of them.
    if (target.isFolder !== (zone === 'inside')) {
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
    this.applyNodes(nodes, undefined);

    // the flat scene list follows what the tree shows
    this.folderService.sortItems(this.projectService.project.sceneFolders, this.projectService.project.scenes);

    // rebuilds the tree through the subscription above
    this.sceneService.scenesChanged.next();
    this.livePreviewService.previewLive();
  }

  private applyNodes(nodes: TreeNode[], parentUuid: string) {
    nodes.forEach((node, index) => {
      if (node.sceneFolder) {
        node.sceneFolder.parentUuid = parentUuid;
        node.sceneFolder.sortIndex = index;
        this.applyNodes(node.children ?? [], node.sceneFolder.uuid);

        return;
      }

      if (!node.scene) {
        return;
      }

      node.scene.folderUuid = parentUuid;
      node.scene.sortIndex = index;

      const presetUuids: string[] = [];

      for (const presetNode of node.children ?? []) {
        // a folder dragged in from the preset tree stands for all presets inside it
        for (const preset of this.draggedPresets(presetNode)) {
          if (presetUuids.indexOf(preset.uuid) < 0) {
            presetUuids.push(preset.uuid);
          }
        }
      }

      node.scene.presetUuids = presetUuids;
    });
  }

  // a row was clicked -> it becomes what the trash button acts on. updateSelection()
  // runs right after this, through the scene selection.
  onActivate(node: TreeNode) {
    this.targetFolder = node.sceneFolder;
    this.targetScene = node.scene;
    this.targetPreset = node.preset;
  }

  private updateFocusedNode() {
    // a preset picked somewhere else takes the mark off the one clicked here, so the
    // tree never keeps marking a preset which is not the one being edited
    if (this.targetPreset && this.targetPreset !== this.presetService.selectedPreset) {
      this.targetPreset = undefined;
    }

    if (this.targetFolder) {
      this.focusedNode = this.findNode(this.treeNodes, (node) => node.sceneFolder === this.targetFolder);
      return;
    }

    const sceneNode = this.findNode(this.treeNodes, (node) => node.scene === this.targetScene && node.isFolder);

    this.focusedNode = this.targetPreset
      ? (sceneNode?.children ?? []).find((node: TreeNode) => node.preset === this.targetPreset) || sceneNode
      : sceneNode;
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

  // opening and closing a scene or a folder is remembered with the project
  onNodeExpandedChange(node: TreeNode) {
    if (node.sceneFolder) {
      node.sceneFolder.expanded = node.expanded;
      return;
    }

    node.scene.expanded = node.expanded;
  }

  // one button for both directions: collapse everything, or open it up again once
  // everything is closed
  allScenesCollapsed(): boolean {
    return (
      !this.projectService.project.scenes.some((scene) => scene.expanded !== false) &&
      !this.projectService.project.sceneFolders.some((folder) => folder.expanded !== false)
    );
  }

  switchAllScenesCollapsed() {
    const expanded = this.allScenesCollapsed();

    for (const scene of this.projectService.project.scenes) {
      scene.expanded = expanded;
    }

    for (const folder of this.projectService.project.sceneFolders) {
      folder.expanded = expanded;
    }

    this.buildTree();
  }

  addScene() {
    // create it above the scene which was clicked last (or the one being played), inside
    // the same folder. A folder which was clicked last takes it in instead.
    const above = this.targetFolder ? undefined : this.targetScene || this.sceneService.selectedScenes[0];
    const folderUuid = this.targetFolder ? this.targetFolder.uuid : above?.folderUuid;

    // the new scene is what the trash acts on now
    this.targetScene = this.sceneService.addScene(undefined, folderUuid, above);
    this.targetFolder = undefined;
    this.targetPreset = undefined;

    // the tree was already rebuilt while the scene was added -> move the ring over
    this.updateSelection();
  }

  // the copy button acts on whatever was clicked last, the same way the trash does:
  // a preset played in a scene, or the scene itself
  duplicateLabel(): string {
    return this.targetPreset ? 'designer.scene.duplicate-preset' : 'designer.scene.duplicate';
  }

  duplicate() {
    if (this.targetPreset && this.targetScene) {
      const index = this.targetScene.presetUuids.indexOf(this.targetPreset.uuid);
      const copy = this.presetService.duplicatePreset(this.targetPreset, this.copyName(this.targetPreset.name));

      if (copy) {
        // the copy is what the trash acts on now and is layered right below the preset
        // it was copied from
        this.targetPreset = copy;
        this.sceneService.addPresetToScene(this.targetScene, copy, index + 1);
        this.updateSelection();
      }

      return;
    }

    const scene = this.targetScene || this.sceneService.selectedScenes[0];

    if (!scene) {
      return;
    }

    // the copy is what the trash acts on now
    this.targetScene = this.sceneService.duplicateScene(scene, this.copyName(scene.name));
    this.targetFolder = undefined;
    this.targetPreset = undefined;

    // the tree was already rebuilt while the scene was copied -> move the ring over
    this.updateSelection();
  }

  // the name a copy is given, so it can be told apart from the one it was copied from
  private copyName(name: string): string {
    return this.translateService.instant('designer.misc.copy-name', { name });
  }

  addFolder() {
    const folder = this.folderService.createFolder(
      this.projectService.project.sceneFolders,
      this.projectService.project.scenes,
      this.translateService.instant('designer.scene.new-folder'),
      this.targetFolder ? this.targetFolder.parentUuid : this.targetScene?.folderUuid
    );

    this.targetFolder = folder;
    this.targetScene = undefined;
    this.targetPreset = undefined;
    this.buildTree();
  }

  // the trash button removes whatever was clicked last: a folder, a preset of a scene
  // or the scene itself
  removeLabel(): string {
    if (this.targetFolder) {
      return 'designer.scene.remove-folder';
    }

    return this.targetPreset ? 'designer.scene.remove-preset' : 'designer.scene.remove';
  }

  remove() {
    if (this.targetFolder) {
      // the content of a folder is not deleted along with it, it moves up
      this.folderService.removeFolder(this.projectService.project.sceneFolders, this.projectService.project.scenes, this.targetFolder);
      this.targetFolder = undefined;
      this.folderService.sortItems(this.projectService.project.sceneFolders, this.projectService.project.scenes);
      this.buildTree();
      return;
    }

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

  // double clicking a row opens it: a scene its own settings, a preset layered in it
  // the settings of that preset
  onNodeDoubleClick(node: TreeNode) {
    if (node.preset) {
      this.modalService.show(PresetSettingsComponent, {
        keyboard: true,
        ignoreBackdropClick: false,
        class: '',
        initialState: { preset: node.preset },
      });
    } else if (node.scene) {
      this.openSettings(node.scene);
    }
  }

  // the dimmer of a scene as a percentage, for the scene tree to mark a dimmed one with
  dimmerPercentage(scene: Scene): number {
    return Math.round(scene.dimmer * 100);
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
