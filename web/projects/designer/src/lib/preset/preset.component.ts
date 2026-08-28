import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { Folder } from '../models/folder';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { FolderService } from '../services/folder.service';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TreeDropZone, TreeNode } from '../tree/tree.component';
import { PresetSettingsComponent } from './preset-settings/preset-settings.component';

@Component({
  selector: 'lib-app-preset',
  templateUrl: './preset.component.html',
  styleUrls: ['./preset.component.css'],
  standalone: false,
})
export class PresetComponent implements OnInit, OnDestroy {
  // all presets of the project, grouped in their folders
  treeNodes: TreeNode[] = [];
  selectedNodes: TreeNode[] = [];
  focusedNode: TreeNode = undefined;

  private subscriptions: Subscription[] = [];

  // what the trash button acts on: the folder or the preset which was clicked last
  private targetFolder: Folder = undefined;

  constructor(
    public presetService: PresetService,
    public sceneService: SceneService,
    public projectService: ProjectService,
    public introService: IntroService,
    private folderService: FolderService,
    private translateService: TranslateService,
    private modalService: BsModalService
  ) {}

  ngOnInit() {
    this.buildTree();

    this.subscriptions.push(
      this.projectService.projectChanged.subscribe(() => this.buildTree()),
      this.presetService.presetsChanged.subscribe(() => this.buildTree()),
      this.presetService.previewSelectionChanged.subscribe(() => this.updateSelection()),
      this.sceneService.sceneSelected.subscribe(() => this.updateSelection())
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
      this.projectService.project.presetFolders,
      this.projectService.project.presets,
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
          folder: child.folder,
          children: this.buildNodes(child.folder.uuid),
        });
      } else {
        const preset = child.item as Preset;

        nodes.push({
          id: preset.uuid,
          isFolder: false,
          icon: 'fa-lightbulb-o',
          preset,
        });
      }
    }

    return nodes;
  }

  private updateSelection() {
    this.updateFocusedNode();

    // the preset being edited is what the tree marks, unless the user selected several
    // rows here to drag them together
    if (this.selectedNodes.length > 1 && this.selectedNodes.some((node) => node.preset === this.presetService.selectedPreset)) {
      return;
    }

    const presetNode = this.findPresetNode(this.treeNodes, this.presetService.selectedPreset);

    this.selectedNodes = presetNode ? [presetNode] : [];
  }

  private updateFocusedNode() {
    this.focusedNode = this.targetFolder
      ? this.findFolderNode(this.treeNodes, this.targetFolder)
      : this.findPresetNode(this.treeNodes, this.presetService.selectedPreset);
  }

  private findPresetNode(nodes: TreeNode[], preset: Preset): TreeNode {
    for (const node of nodes) {
      if (node.preset && node.preset === preset) {
        return node;
      }

      const found = this.findPresetNode(node.children ?? [], preset);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private findFolderNode(nodes: TreeNode[], folder: Folder): TreeNode {
    for (const node of nodes) {
      if (node.folder === folder) {
        return node;
      }

      const found = this.findFolderNode(node.children ?? [], folder);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  // a folder cannot be dropped into itself, everything else may go anywhere
  allowDrop = (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone): boolean => {
    if (zone === 'inside' && !target.isFolder) {
      return false;
    }

    return dragged.every((node) => !node.folder || !this.containsFolder(node, target));
  };

  private containsFolder(node: TreeNode, target: TreeNode): boolean {
    for (const child of node.children ?? []) {
      if (child === target || this.containsFolder(child, target)) {
        return true;
      }
    }

    return false;
  }

  onNodesChange(nodes: TreeNode[]) {
    this.applyNodes(nodes, undefined);

    // the flat preset list follows what the tree shows
    this.folderService.sortItems(this.projectService.project.presetFolders, this.projectService.project.presets);

    this.buildTree();
  }

  private applyNodes(nodes: TreeNode[], parentUuid: string) {
    nodes.forEach((node, index) => {
      if (node.folder) {
        node.folder.parentUuid = parentUuid;
        node.folder.sortIndex = index;
        this.applyNodes(node.children ?? [], node.folder.uuid);
      } else if (node.preset) {
        node.preset.folderUuid = parentUuid;
        node.preset.sortIndex = index;
      }
    });
  }

  onNodeExpandedChange(node: TreeNode) {
    node.folder.expanded = node.expanded;
  }

  onActivate(node: TreeNode) {
    this.targetFolder = node.folder;

    if (node.preset) {
      this.presetService.selectPreset(this.projectService.project.presets.indexOf(node.preset));
    }

    this.updateSelection();
  }

  onSelectedNodesChange(nodes: TreeNode[]) {
    this.selectedNodes = nodes;
  }

  // one button for both directions, the same way the scene panel does it
  allFoldersCollapsed(): boolean {
    return !this.projectService.project.presetFolders.some((folder) => folder.expanded !== false);
  }

  switchAllFoldersCollapsed() {
    const expanded = this.allFoldersCollapsed();

    for (const folder of this.projectService.project.presetFolders) {
      folder.expanded = expanded;
    }

    this.buildTree();
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

  soloPreset(): boolean {
    return this.projectService.project.previewPreset;
  }

  switchSoloPreset() {
    this.presetService.setPreviewPreset(!this.projectService.project.previewPreset);
  }

  addPreset() {
    const scene = this.singleSelectedScene();

    // insert the new preset right above the currently selected one, or on top of
    // the scene, if the selected preset is not part of it
    let index = 0;

    if (scene && this.presetService.selectedPreset) {
      index = Math.max(scene.presetUuids.indexOf(this.presetService.selectedPreset.uuid), 0);
    }

    // create it next to the preset being edited, inside the same folder
    const folderUuid = this.presetService.selectedPreset ? this.presetService.selectedPreset.folderUuid : this.targetFolder?.uuid;

    // the new preset is what the trash acts on now
    this.targetFolder = undefined;

    this.presetService.addPreset();
    this.presetService.selectedPreset.folderUuid = folderUuid;
    this.presetService.selectedPreset.sortIndex = -1;
    this.folderService.renumber(this.projectService.project.presetFolders, this.projectService.project.presets, folderUuid);
    this.folderService.sortItems(this.projectService.project.presetFolders, this.projectService.project.presets);

    if (scene) {
      this.sceneService.addPresetToScene(scene, this.presetService.selectedPreset, index);
    }

    this.buildTree();
  }

  addFolder() {
    const folder = this.folderService.createFolder(
      this.projectService.project.presetFolders,
      this.projectService.project.presets,
      this.translateService.instant('designer.preset.new-folder'),
      this.targetFolder ? this.targetFolder.parentUuid : this.presetService.selectedPreset?.folderUuid
    );

    this.targetFolder = folder;
    this.buildTree();
  }

  removeLabel(): string {
    return this.targetFolder ? 'designer.preset.remove-folder' : 'designer.preset.remove';
  }

  remove() {
    if (this.targetFolder) {
      // the content of a folder is not deleted along with it, it moves up
      this.folderService.removeFolder(this.projectService.project.presetFolders, this.projectService.project.presets, this.targetFolder);
      this.targetFolder = undefined;
      this.folderService.sortItems(this.projectService.project.presetFolders, this.projectService.project.presets);
      this.buildTree();
      return;
    }

    if (!this.presetService.selectedPreset) {
      return;
    }

    const preset = this.presetService.selectedPreset;

    this.sceneService.removePresetFromAllScenes(preset);
    this.presetService.removePreset(preset);
  }

  // double clicking a preset opens it, the same way its own button does
  onNodeDoubleClick(node: TreeNode) {
    if (node.preset) {
      this.openSettings(node);
    }
  }

  openSettings(node: TreeNode) {
    this.modalService.show(PresetSettingsComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { preset: node.preset },
    });
  }
}
