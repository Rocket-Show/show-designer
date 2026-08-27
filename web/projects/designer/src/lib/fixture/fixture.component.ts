import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { Folder } from '../models/folder';
import { FixturePoolService } from '../services/fixture-pool.service';
import { FixtureService } from '../services/fixture.service';
import { FolderService } from '../services/folder.service';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { PresetFixture } from '../models/preset-fixture';
import type { Options } from 'sortablejs';
import { LivePreviewService } from '../services/live-preview.service';
import { TreeDropZone, TreeNode } from '../tree/tree.component';

@Component({
  selector: 'lib-app-fixture',
  templateUrl: './fixture.component.html',
  styleUrls: ['./fixture.component.css'],
  standalone: false,
})
export class FixtureComponent implements OnInit, OnDestroy {
  fixtureSortableOptions: Options = {
    onUpdate: () => this.fixtureListReordered(),
  };

  // the fixtures which are not part of the current preset (only used, when the preset
  // brings its own fixture order)
  otherFixtures: PresetFixture[] = [];

  // the fixtures of the project, grouped in folders
  treeNodes: TreeNode[] = [];
  selectedNodes: TreeNode[] = [];

  // the row which was clicked last, marked apart from the selection: it is what the
  // folder buttons act on
  focusedNode: TreeNode = undefined;

  private subscriptions: Subscription[] = [];

  // what the trash button acts on: the folder which was clicked last
  private targetFolder: Folder = undefined;
  private targetFixture: PresetFixture = undefined;

  constructor(
    public projectService: ProjectService,
    public presetService: PresetService,
    private fixturePoolService: FixturePoolService,
    public fixtureService: FixtureService,
    public introService: IntroService,
    private folderService: FolderService,
    private translateService: TranslateService,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.updateOtherFixtures();
    this.buildTree();

    this.subscriptions.push(
      this.presetService.fixtureSelectionChanged.subscribe(() => {
        this.updateOtherFixtures();
        this.buildTree();
      }),
      this.presetService.previewSelectionChanged.subscribe(() => this.updateOtherFixtures()),
      this.projectService.projectChanged.subscribe(() => {
        this.updateOtherFixtures();
        this.buildTree();
      })
    );
  }

  ngOnDestroy() {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  // does the current preset define its own fixture order?
  usePresetOrder(): boolean {
    return (
      !!this.presetService.selectedPreset &&
      !this.presetService.selectedPreset.useGlobalFixtureOrder &&
      !this.fixtureService.settingsSelection
    );
  }

  // the preset either brings its own fixture order or follows the global one of the project
  switchCustomFixtureOrder(customFixtureOrder: boolean) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.presetService.setUseGlobalFixtureOrder(this.presetService.selectedPreset, !customFixtureOrder);
    this.updateOtherFixtures();
  }

  private updateOtherFixtures() {
    const preset = this.presetService.selectedPreset;

    if (!preset) {
      this.otherFixtures = [];
      return;
    }

    this.otherFixtures = this.projectService.project.presetFixtures.filter(
      (projectFixture) => !this.presetService.getPresetFixture(preset, projectFixture.fixtureUuid, projectFixture.pixelKey)
    );
  }

  // ---- the fixture tree ----------------------------------------------------

  private buildTree() {
    this.treeNodes = this.buildNodes(undefined);
    this.updateFocusedNode();
  }

  private buildNodes(parentUuid: string): TreeNode[] {
    const nodes: TreeNode[] = [];
    const children = this.folderService.getChildren(
      this.projectService.project.fixtureFolders,
      this.projectService.project.presetFixtures,
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

        continue;
      }

      const presetFixture = child.item as PresetFixture;

      nodes.push({
        id: presetFixture.fixtureUuid + '/' + (presetFixture.pixelKey || ''),
        isFolder: false,
        iconClass: 'icon-' + this.fixtureIconClass(presetFixture),
        presetFixture,
      });
    }

    return nodes;
  }

  private updateFocusedNode() {
    this.focusedNode = this.findNode(this.treeNodes, (node) =>
      this.targetFolder ? node.folder === this.targetFolder : !!this.targetFixture && node.presetFixture === this.targetFixture
    );
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

  // a fixture which is not part of the current preset is dimmed, the same way the flat
  // list dims it
  nodeClass = (node: TreeNode): string => (node.presetFixture && !this.fixtureIsSelected(node.presetFixture) ? 'inactive-list-item' : '');

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

    // the flat fixture list follows what the tree shows: it is the order the presets
    // chase their fixtures in
    this.folderService.sortItems(this.projectService.project.fixtureFolders, this.projectService.project.presetFixtures);

    this.buildTree();
    this.fixtureListReordered();
  }

  private applyNodes(nodes: TreeNode[], parentUuid: string) {
    nodes.forEach((node, index) => {
      if (node.folder) {
        node.folder.parentUuid = parentUuid;
        node.folder.sortIndex = index;
        this.applyNodes(node.children ?? [], node.folder.uuid);
      } else if (node.presetFixture) {
        node.presetFixture.folderUuid = parentUuid;
        node.presetFixture.sortIndex = index;
      }
    });
  }

  onNodeExpandedChange(node: TreeNode) {
    node.folder.expanded = node.expanded;
  }

  // a plain click checks and unchecks a fixture, it does not select the row -> only the
  // folder which was clicked last is remembered, for the folder buttons
  onActivate(node: TreeNode) {
    this.targetFolder = node.folder;
    this.targetFixture = node.presetFixture;

    if (node.presetFixture) {
      this.selectFixture(node.presetFixture);
    }

    this.updateFocusedNode();
  }

  onSelectedNodesChange(nodes: TreeNode[]) {
    this.selectedNodes = nodes;
  }

  // one button for both directions, the same way the other panels do it
  allFoldersCollapsed(): boolean {
    return !this.projectService.project.fixtureFolders.some((folder) => folder.expanded !== false);
  }

  switchAllFoldersCollapsed() {
    const expanded = this.allFoldersCollapsed();

    for (const folder of this.projectService.project.fixtureFolders) {
      folder.expanded = expanded;
    }

    this.buildTree();
  }

  addFolder() {
    const folder = this.folderService.createFolder(
      this.projectService.project.fixtureFolders,
      this.projectService.project.presetFixtures,
      this.translateService.instant('designer.fixture.new-folder'),
      this.targetFolder ? this.targetFolder.parentUuid : this.targetFixture?.folderUuid
    );

    this.targetFolder = folder;
    this.targetFixture = undefined;
    this.buildTree();
  }

  // fixtures are added and removed in the fixture pool, so the trash only deletes a
  // folder here
  removeFolder() {
    if (!this.targetFolder) {
      return;
    }

    // the content of a folder is not deleted along with it, it moves up
    this.folderService.removeFolder(
      this.projectService.project.fixtureFolders,
      this.projectService.project.presetFixtures,
      this.targetFolder
    );
    this.targetFolder = undefined;
    this.folderService.sortItems(this.projectService.project.fixtureFolders, this.projectService.project.presetFixtures);
    this.buildTree();
    this.fixtureListReordered();
  }

  // ---- the fixture rows ----------------------------------------------------

  fixtureIconClass(presetFixture: PresetFixture): string {
    return this.fixtureService.getFixtureIconClass(
      this.fixtureService.getProfileByUuid(this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid).profileUuid)
    );
  }

  fixtureName(presetFixture: PresetFixture) {
    let name: string;
    name = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid).name;
    if (presetFixture.pixelKey) {
      name += ' - ' + presetFixture.pixelKey;
    }
    return name;
  }

  fixtureIsSelected(presetFixture: PresetFixture): boolean {
    const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
    if (this.fixtureService.settingsSelection) {
      return this.fixtureService.settingsFixtureIsSelected(fixture);
    } else {
      return this.presetService.fixtureIsSelected(fixture, presetFixture.pixelKey);
    }
  }

  selectFixture(presetFixture: PresetFixture) {
    const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
    if (this.fixtureService.settingsSelection) {
      // select fixtures for the settings
      this.fixtureService.switchSettingsFixtureSelection(fixture);
      this.presetService.fixtureSelectionSettingsChanged.next();
    } else {
      // select fixtures for the current preset
      this.presetService.switchFixtureSelection(fixture, presetFixture.pixelKey);
      this.presetService.fixtureSelectionChanged.next();
      this.livePreviewService.previewLive();
    }
  }

  selectAll() {
    this.presetService.selectAllFixtures();
    this.presetService.fixtureSelectionChanged.next();
    this.livePreviewService.previewLive();
  }

  selectNone() {
    this.presetService.selectNoFixtures();
    this.presetService.fixtureSelectionChanged.next();
    this.livePreviewService.previewLive();
  }

  fixtureListReordered() {
    this.livePreviewService.previewLive();
  }

  openFixturePool() {
    this.fixturePoolService.open();
  }
}
