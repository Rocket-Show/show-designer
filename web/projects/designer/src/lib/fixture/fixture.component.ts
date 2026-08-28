import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { Folder } from '../models/folder';
import { FolderPosition } from '../models/folder-position';
import { Preset } from '../models/preset';
import { FixtureOrderService } from '../services/fixture-order.service';
import { FixturePoolService } from '../services/fixture-pool.service';
import { FixtureService } from '../services/fixture.service';
import { FolderItem, FolderService } from '../services/folder.service';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { PresetFixture } from '../models/preset-fixture';
import { LivePreviewService } from '../services/live-preview.service';
import { TreeDropZone, TreeNode } from '../tree/tree.component';

// One row of the fixture tree. The project's entry says what the row is, the preset's
// own entry (if it has one) says where the row sits while the preset brings its own
// fixture order.
interface FixtureOrderItem extends FolderItem {
  presetFixture: PresetFixture;
  orderEntry?: PresetFixture;
}

@Component({
  selector: 'lib-app-fixture',
  templateUrl: './fixture.component.html',
  styleUrls: ['./fixture.component.css'],
  standalone: false,
})
export class FixtureComponent implements OnInit, OnDestroy {
  // the fixtures which are not part of the current preset (they come after the ones it
  // chases, when the preset brings its own fixture order)
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

  // the parent of every row, to keep a preset's own order inside the project's folders
  private parentOf = new Map<TreeNode, TreeNode>();

  constructor(
    public projectService: ProjectService,
    public presetService: PresetService,
    private fixturePoolService: FixturePoolService,
    public fixtureService: FixtureService,
    public introService: IntroService,
    private folderService: FolderService,
    private fixtureOrderService: FixtureOrderService,
    private translateService: TranslateService,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.buildTree();

    this.subscriptions.push(
      this.presetService.fixtureSelectionChanged.subscribe(() => this.buildTree()),
      this.presetService.previewSelectionChanged.subscribe(() => this.buildTree()),
      this.projectService.projectChanged.subscribe(() => this.buildTree())
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
    this.buildTree();
    this.fixtureListReordered();
  }

  private orderedPreset(): Preset {
    return this.usePresetOrder() ? this.presetService.selectedPreset : undefined;
  }

  // ---- the fixture tree ----------------------------------------------------

  private buildTree() {
    const preset = this.orderedPreset();

    this.updateOtherFixtures();

    if (preset) {
      this.fixtureOrderService.syncPresetOrder(preset);
    }

    this.parentOf.clear();
    this.treeNodes = this.buildNodes(this.fixtureOrderService.getFolders(preset), this.orderItems(preset), undefined, undefined);
    this.updateFocusedNode();
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

  // The rows of the tree: the project's fixtures in its own order, or the ones the
  // preset chases in the preset's order, with the rest of them following in every folder.
  private orderItems(preset: Preset): FixtureOrderItem[] {
    if (!preset) {
      return this.projectService.project.presetFixtures.map((projectFixture) => ({
        folderUuid: projectFixture.folderUuid,
        sortIndex: projectFixture.sortIndex,
        presetFixture: projectFixture,
        orderEntry: projectFixture,
      }));
    }

    const items: FixtureOrderItem[] = [];
    const projectFixtures = this.fixtureOrderService.getProjectFixtures();

    // every position handed out is an index among siblings, so this is past all of them
    let last = this.projectService.project.fixtureFolders.length + this.projectService.project.presetFixtures.length;

    for (const entry of preset.fixtures) {
      const projectFixture = projectFixtures.get(this.fixtureOrderService.fixtureKey(entry));

      if (projectFixture) {
        items.push({ folderUuid: entry.folderUuid, sortIndex: entry.sortIndex, presetFixture: projectFixture, orderEntry: entry });
      }
    }

    // a fixture this preset does not chase has no place of its own -> it follows the
    // ones it does chase, inside the folder it belongs to
    for (const projectFixture of this.otherFixtures) {
      items.push({ folderUuid: projectFixture.folderUuid, sortIndex: ++last, presetFixture: projectFixture });
    }

    return items;
  }

  private buildNodes(folders: Folder[], items: FixtureOrderItem[], parentUuid: string, parent: TreeNode): TreeNode[] {
    const nodes: TreeNode[] = [];

    for (const child of this.folderService.getChildren(folders, items, parentUuid)) {
      let node: TreeNode;

      if (child.folder) {
        const folder = this.projectService.project.fixtureFolders.find((candidate) => candidate.uuid === child.folder.uuid);

        node = {
          id: folder.uuid,
          isFolder: true,
          expanded: folder.expanded !== false,
          icon: 'fa-folder-o',
          iconOpen: 'fa-folder-open-o',
          toggleOnClick: true,
          folder,
          children: [],
        };
        node.children = this.buildNodes(folders, items, folder.uuid, node);
      } else {
        const item = child.item as FixtureOrderItem;

        node = {
          id: this.fixtureOrderService.fixtureKey(item.presetFixture),
          isFolder: false,
          iconClass: 'icon-' + this.fixtureIconClass(item.presetFixture),
          presetFixture: item.presetFixture,
          orderEntry: item.orderEntry,
        };
      }

      this.parentOf.set(node, parent);
      nodes.push(node);
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

  // a fixture which is not part of the current preset is dimmed, the same way the list
  // dimmed it
  nodeClass = (node: TreeNode): string => (node.presetFixture && !this.fixtureIsSelected(node.presetFixture) ? 'inactive-list-item' : '');

  // a preset only orders the fixtures it chases: the others follow them and stay put
  allowDrag = (node: TreeNode): boolean => !this.usePresetOrder() || !node.presetFixture || !!node.orderEntry;

  allowDrop = (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone): boolean => {
    if (zone === 'inside' && !target.isFolder) {
      return false;
    }

    if (dragged.some((node) => node.folder && this.containsFolder(node, target))) {
      return false;
    }

    if (!this.usePresetOrder()) {
      return true;
    }

    // a fixture stays in the folder it belongs to and the folders keep the project's
    // structure: a preset only moves a row among the rows it already sits with. And
    // nothing is placed next to a fixture the preset does not chase, they come last.
    if (target.presetFixture && !target.orderEntry) {
      return false;
    }

    const targetParent = zone === 'inside' ? target : this.parentOf.get(target);

    return dragged.every((node) => this.parentOf.get(node) === targetParent);
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
    const preset = this.orderedPreset();

    this.applyNodes(nodes, undefined, preset);

    if (preset) {
      // the preset's own list follows what the tree shows: it is the order it chases in
      this.folderService.sortItems(this.fixtureOrderService.getFolders(preset), preset.fixtures);
    } else {
      this.fixtureOrderService.sortProjectFixtures();
      this.fixtureOrderService.syncPresetOrders();
    }

    this.buildTree();
    this.fixtureListReordered();
  }

  private applyNodes(nodes: TreeNode[], parentUuid: string, preset: Preset) {
    nodes.forEach((node, index) => {
      if (node.folder) {
        if (preset) {
          this.setFolderPosition(preset, node.folder, index);
        } else {
          node.folder.parentUuid = parentUuid;
          node.folder.sortIndex = index;
        }

        this.applyNodes(node.children ?? [], node.folder.uuid, preset);
        return;
      }

      if (!node.orderEntry) {
        return;
      }

      if (!preset) {
        node.orderEntry.folderUuid = parentUuid;
      }

      node.orderEntry.sortIndex = index;
    });
  }

  private setFolderPosition(preset: Preset, folder: Folder, sortIndex: number) {
    let position = preset.fixtureFolders.find((candidate) => candidate.folderUuid === folder.uuid);

    if (!position) {
      position = new FolderPosition();
      position.folderUuid = folder.uuid;
      preset.fixtureFolders.push(position);
    }

    position.sortIndex = sortIndex;
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
    this.fixtureOrderService.sortProjectFixtures();
    // the presets which gave the folder a place of their own do not need it anymore
    this.fixtureOrderService.syncPresetOrders();
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
