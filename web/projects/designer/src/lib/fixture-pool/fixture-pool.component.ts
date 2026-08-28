import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { Fixture } from '../models/fixture';
import { FixtureProfile } from '../models/fixture-profile';
import { Folder } from '../models/folder';
import { ConfigService } from '../services/config.service';
import { HardwarePromoService } from '../services/hardware-promo.service';
import { FixtureService } from '../services/fixture.service';
import { PresetService } from '../services/preset.service';
import { PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';
import { UuidService } from '../services/uuid.service';
import { FixturePoolCreateFromFileComponent } from './fixture-pool-create-from-file/fixture-pool-create-from-file.component';
import { FixturePoolEditUniversesComponent } from './fixture-pool-edit-universes/fixture-pool-edit-universes.component';
import { PresetFixture } from '../models/preset-fixture';
import { FixtureOrderService } from '../services/fixture-order.service';
import { FolderItem, FolderService } from '../services/folder.service';
import { HotkeyTargetExcludeService } from '../services/hotkey-target-exclude.service';
import { LivePreviewService } from '../services/live-preview.service';
import { UniverseConfig } from '../models/universe-config';
import { TreeDropZone, TreeNode } from '../tree/tree.component';

// One row of the fixture tree: a fixture of the pool and the folder it is in. The
// fixture panel shows a fixture with all its pixels, here it is a single row which
// stands for all of them.
interface PoolFixture extends FolderItem {
  fixture: Fixture;
}

// One channel of the DMX map: what is drawn on it. The whole map is built again
// whenever the patch changes, instead of asking every fixture about every one of the
// 512 channels while the map is drawn - the pool stays open while the user works, so
// that ran on every mouse move.
interface DmxChannel {
  occupied: boolean;
  // the first and the last channel of a fixture, which the bar is capped at
  start: boolean;
  end: boolean;
  selected: boolean;
  overlapped: boolean;
}

@Component({
  selector: 'lib-app-fixture-pool',
  templateUrl: './fixture-pool.component.html',
  styleUrls: ['./fixture-pool.component.css'],
  standalone: false,
})
export class FixturePoolComponent implements OnInit, AfterViewInit, OnDestroy {
  // the profiles the search list shows, and how many more the search matched (see
  // maxShownProfiles)
  public filteredProfiles: FixtureProfile[] = [];
  public hiddenProfileCount = 0;

  public loadingProfiles = false;

  public fixturePool: Fixture[];

  // the fixture folders of the project, edited here like the fixtures themselves and
  // only handed over to the project on OK
  public fixtureFolders: Folder[];

  // the fixtures of the pool, grouped in those folders
  public treeNodes: TreeNode[] = [];
  public selectedNodes: TreeNode[] = [];

  // the row which was clicked last, marked apart from the selection: it is what the
  // folder buttons act on
  public focusedNode: TreeNode = undefined;

  public dmxChannels: DmxChannel[] = [];

  // The channel map. It is drawn rather than built from an element per channel, and it
  // watches the pointer itself, so neither the browser nor angular has 512 of anything
  // to walk while the pointer crosses this dialog.
  @ViewChild('dmxMap') dmxMap: ElementRef<HTMLElement>;
  @ViewChild('dmxCanvas') dmxCanvas: ElementRef<HTMLCanvasElement>;
  @ViewChild('channelLabel') channelLabel: ElementRef<HTMLElement>;

  public selectedFixture: Fixture;
  public selectedFixtureProfile: FixtureProfile;
  public channelDragFixture: Fixture;
  public channelDragOffset: number;

  public onClose: Subject<number> = new Subject();

  public searchExpression: string;

  public updatingProfiles: boolean;

  // Universes the user can choose from. In "free edit" mode the user can
  // extend this list at runtime; otherwise it is provided by the host
  // application through the ConfigService.
  public universes: UniverseConfig[] = [];

  // The currently active universe. The channel map and fixture list are
  // filtered to only show fixtures belonging to this universe.
  public selectedUniverse: UniverseConfig;

  public promoLink: string;

  // The fixture library holds thousands of profiles, of which a list this size shows a
  // handful. Building a row for every one of them costs seconds and makes everything
  // the pool does afterwards slow, so the search shows the first matches and says how
  // many more there are.
  private static readonly maxShownProfiles = 50;

  // the size of one channel on the map, in px
  private static readonly channelWidth = 28;
  private static readonly channelHeight = 20;

  // how many channels the map fits on a row, which follows the width it is given
  private channelsPerRow = 1;

  // the channel the cursor is on, so the label is only moved when it changes
  private labelledChannel = -1;

  private mapResized: ResizeObserver;

  // one row per fixture of the pool, in the folders of the project
  private fixtureItems: PoolFixture[] = [];

  // every profile together with the text the search runs against, prepared once
  private searchIndex: { profile: FixtureProfile; text: string }[] = [];

  // what the trash button acts on: the folder which was clicked last
  private targetFolder: Folder = undefined;

  // Did the user move something around in the tree? Only then is the order of the whole
  // fixture list written back on OK: it is the panel's own one, where a fixture with
  // pixels takes several rows which can be ordered on their own.
  private fixtureOrderChanged = false;

  constructor(
    public bsModalRef: BsModalRef,
    public fixtureService: FixtureService,
    private uuidService: UuidService,
    public projectService: ProjectService,
    private previewService: PreviewService,
    private translateService: TranslateService,
    private toastrService: ToastrService,
    private presetService: PresetService,
    public configService: ConfigService,
    private modalService: BsModalService,
    private folderService: FolderService,
    private fixtureOrderService: FixtureOrderService,
    private ngZone: NgZone,
    private hotkeyTargetExcludeService: HotkeyTargetExcludeService,
    private livePreviewService: LivePreviewService,
    public hardwarePromoService: HardwarePromoService
  ) {
    this.promoLink = this.hardwarePromoService.link('dmx-overview');

    this.fixturePool = structuredClone(this.projectService.project.fixtures);

    // the fixtures are grouped in the same folders the fixture panel shows
    this.fixtureFolders = this.projectService.project.fixtureFolders.map((folder) => new Folder(folder));
    this.buildFixtureItems();
    this.buildTree();

    // Initialise the universe list from the config. We keep a local copy so
    // edits done in free-edit mode don't bleed into the config until the user
    // confirms with OK (see `ok()` below).
    this.universes = structuredClone(this.configService.universes || []);

    if (this.universes.length === 0 && this.configService.freeUniverseEdit) {
      this.universes.push({ uuid: this.uuidService.getUuid(), name: 'Universe 1' });
    }

    if (this.universes.length > 0) {
      this.selectedUniverse = this.universes[0];
    }

    const firstVisible = this.currentUniverseFixtures[0] ?? this.fixturePool[0];
    if (firstVisible) {
      this.selectFixture(firstVisible);
    }
  }

  get freeUniverseEdit(): boolean {
    return this.configService.freeUniverseEdit;
  }

  /** Fixtures belonging to the currently selected universe. */
  get currentUniverseFixtures(): Fixture[] {
    if (!this.selectedUniverse) {
      return this.fixturePool;
    }
    return this.fixturePool.filter((f) => f.dmxUniverseUuid === this.selectedUniverse.uuid);
  }

  /** Fixtures used for channel-map calculations (same as currentUniverseFixtures). */
  private get channelFixtures(): Fixture[] {
    return this.currentUniverseFixtures;
  }

  selectUniverse(universe: UniverseConfig) {
    this.selectedUniverse = universe;
    // Deselect the current fixture if it doesn't belong to the new universe.
    if (this.selectedFixture && this.selectedFixture.dmxUniverseUuid !== universe?.uuid) {
      this.selectFixture(this.currentUniverseFixtures[0] ?? undefined);
    }

    // the map shows the channels of the selected universe
    this.updateChannelMap();
  }

  ngOnInit() {
    for (let i = 0; i < 512; i++) {
      this.dmxChannels.push({ occupied: false, start: false, end: false, selected: false, overlapped: false });
    }

    this.updateChannelMap();
    this.loadProfiles();
  }

  ngAfterViewInit() {
    // Nothing here has to reach angular: the label under the cursor is moved by hand,
    // and only a fixture actually being dragged across the map changes anything the
    // dialog shows.
    this.ngZone.runOutsideAngular(() => {
      this.dmxMap.nativeElement.addEventListener('mousemove', this.channelHovered);
      this.dmxMap.nativeElement.addEventListener('mouseleave', this.channelLeft);

      // the map lays its channels out over the width it is given
      this.mapResized = new ResizeObserver(() => this.drawChannelMap());
      this.mapResized.observe(this.dmxMap.nativeElement);
    });
  }

  ngOnDestroy() {
    this.mapResized?.disconnect();
    this.dmxMap?.nativeElement.removeEventListener('mousemove', this.channelHovered);
    this.dmxMap?.nativeElement.removeEventListener('mouseleave', this.channelLeft);
  }

  // ---- the DMX channel map -------------------------------------------------

  private channelHovered = (event: MouseEvent) => {
    const channel = this.channelAt(event);

    this.labelChannel(channel);

    if (this.channelDragFixture && channel >= 0) {
      this.ngZone.run(() => this.dragChannelTo(channel));
    }
  };

  private channelLeft = () => this.labelChannel(-1);

  // the channel under the cursor, or -1 next to the last one of the map
  private channelAt(event: MouseEvent): number {
    const column = Math.floor(event.offsetX / FixturePoolComponent.channelWidth);
    const row = Math.floor(event.offsetY / FixturePoolComponent.channelHeight);

    if (column < 0 || column >= this.channelsPerRow || row < 0) {
      return -1;
    }

    const channel = row * this.channelsPerRow + column;

    return channel < this.dmxChannels.length ? channel : -1;
  }

  // the number of the channel the cursor is on, in place of a tooltip
  private labelChannel(channel: number) {
    if (channel === this.labelledChannel || !this.channelLabel) {
      return;
    }

    this.labelledChannel = channel;

    const label = this.channelLabel.nativeElement;

    if (channel < 0) {
      label.hidden = true;
      return;
    }

    const column = channel % this.channelsPerRow;
    const row = Math.floor(channel / this.channelsPerRow);

    label.textContent = String(channel + 1);
    label.hidden = false;
    label.style.left = (column + 0.5) * FixturePoolComponent.channelWidth + 'px';
    label.style.top = row * FixturePoolComponent.channelHeight + 'px';
  }

  // Draw the map: the grid of channels, the run of channels every fixture of the
  // universe occupies, the one being edited and the ones two fixtures collide on. The
  // colours are the stylesheet's, so the map is themed with everything else.
  private drawChannelMap() {
    const canvas = this.dmxCanvas?.nativeElement;
    const width = this.dmxMap?.nativeElement.clientWidth ?? 0;

    if (!canvas || !width) {
      return;
    }

    const channelWidth = FixturePoolComponent.channelWidth;
    const channelHeight = FixturePoolComponent.channelHeight;

    this.channelsPerRow = Math.max(1, Math.floor(width / channelWidth));

    const rows = Math.ceil(this.dmxChannels.length / this.channelsPerRow);
    const mapWidth = this.channelsPerRow * channelWidth;
    const mapHeight = rows * channelHeight;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(mapWidth * ratio);
    canvas.height = Math.round(mapHeight * ratio);
    canvas.style.width = mapWidth + 'px';
    canvas.style.height = mapHeight + 'px';

    const context = canvas.getContext('2d');
    const style = getComputedStyle(this.dmxMap.nativeElement);
    const colour = (name: string) => style.getPropertyValue(name).trim();

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, mapWidth, mapHeight);

    // the grid of empty channels
    context.strokeStyle = colour('--dmx-line');
    context.lineWidth = 1;

    for (let channel = 0; channel < this.dmxChannels.length; channel++) {
      // the bar of a fixture is drawn in one piece, so it is not divided into channels
      if (this.dmxChannels[channel].occupied) {
        continue;
      }

      const column = channel % this.channelsPerRow;
      const row = Math.floor(channel / this.channelsPerRow);

      context.strokeRect(column * channelWidth + 0.5, row * channelHeight + 0.5, channelWidth - 1, channelHeight - 1);
    }

    // the fixtures on it, as one bar per run of channels which reads the same way. A
    // fixture whose channels wrap onto the next row is drawn as a bar per row.
    for (const run of this.channelRuns()) {
      const overlapped = run.overlapped;
      const selected = run.selected && !overlapped;

      const x = (run.channel % this.channelsPerRow) * channelWidth;
      const y = Math.floor(run.channel / this.channelsPerRow) * channelHeight;
      const barWidth = run.length * channelWidth;

      context.fillStyle = overlapped ? colour('--dmx-overlap-fill') : selected ? colour('--dmx-selected-fill') : colour('--dmx-fill');
      context.strokeStyle = overlapped ? colour('--dmx-overlap-edge') : colour('--dmx-edge');

      this.channelBar(context, x + 0.5, y + 0.5, barWidth - 1, channelHeight - 1, run.start, run.end);
      context.fill();
      context.stroke();
    }
  }

  // the bars of the map: channels next to each other which are drawn the same way, cut
  // at the end of the row they sit on and at the first and last channel of a fixture
  private channelRuns(): { channel: number; length: number; start: boolean; end: boolean; selected: boolean; overlapped: boolean }[] {
    const runs = [];
    let run: { channel: number; length: number; start: boolean; end: boolean; selected: boolean; overlapped: boolean };

    for (let channel = 0; channel < this.dmxChannels.length; channel++) {
      const state = this.dmxChannels[channel];

      const continues =
        run &&
        state.occupied &&
        !state.start &&
        !this.dmxChannels[channel - 1].end &&
        state.selected === run.selected &&
        state.overlapped === run.overlapped &&
        channel % this.channelsPerRow !== 0;

      if (continues) {
        run.length++;
        run.end = state.end;
        continue;
      }

      run = undefined;

      if (state.occupied) {
        run = { channel, length: 1, start: state.start, end: state.end, selected: state.selected, overlapped: state.overlapped };
        runs.push(run);
      }
    }

    return runs;
  }

  // a bar with the ends of the fixture rounded and the cuts left square
  private channelBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, start: boolean, end: boolean) {
    const radius = Math.min(4, height / 2, width / 2);
    const left = start ? radius : 0;
    const right = end ? radius : 0;

    context.beginPath();
    context.moveTo(x + left, y);
    context.lineTo(x + width - right, y);
    context.arcTo(x + width, y, x + width, y + right, right);
    context.lineTo(x + width, y + height - right);
    context.arcTo(x + width, y + height, x + width - right, y + height, right);
    context.lineTo(x + left, y + height);
    context.arcTo(x, y + height, x, y + height - left, left);
    context.lineTo(x, y + left);
    context.arcTo(x, y, x + left, y, left);
    context.closePath();
  }

  private loadProfiles() {
    this.loadingProfiles = true;

    this.fixtureService.getSearchProfiles().subscribe((profiles) => {
      // the list is shown in this order, so it is sorted once instead of on every search
      this.searchIndex = profiles
        .sort((profile1, profile2) => profile1.uuid.localeCompare(profile2.uuid))
        .map((profile) => ({
          profile,
          text: (profile.uuid + ' ' + profile.name + ' ' + profile.manufacturerName).toLowerCase(),
        }));

      this.filterProfiles();
      this.loadingProfiles = false;
    });
  }

  selectFixture(fixture: Fixture) {
    this.selectedFixtureProfile = undefined;
    if (fixture) {
      this.selectedFixtureProfile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
    }
    this.selectedFixture = fixture;

    // the tree shows the whole pool, whichever universe a fixture is patched in -> follow
    // the selection with the universe, so the channel map shows the fixture being edited
    const universe = this.universes.find((candidate) => candidate.uuid === fixture?.dmxUniverseUuid);

    if (universe) {
      this.selectedUniverse = universe;
    }

    this.updateChannelMap();
    this.updateSelection();
  }

  // ---- the fixture tree ----------------------------------------------------

  // Where the fixtures of the pool sit: a fixture takes the place of its first row in
  // the fixture panel, which shows it together with its pixels. That numbering counts
  // the rows, so it has gaps here - only the order it puts the fixtures in matters.
  private buildFixtureItems() {
    const firstRow = new Map<string, PresetFixture>();

    for (const presetFixture of this.projectService.project.presetFixtures) {
      if (!firstRow.has(presetFixture.fixtureUuid)) {
        firstRow.set(presetFixture.fixtureUuid, presetFixture);
      }
    }

    // a fixture with no row of its own (nothing to select on it) has no place yet: every
    // position handed out is an index among siblings, so this is past all of them
    let last = this.fixtureFolders.length + this.projectService.project.presetFixtures.length;

    this.fixtureItems = this.fixturePool.map((fixture) => {
      const presetFixture = firstRow.get(fixture.uuid);

      return {
        fixture,
        folderUuid: presetFixture ? presetFixture.folderUuid : undefined,
        sortIndex: presetFixture ? presetFixture.sortIndex : ++last,
      };
    });
  }

  private buildTree() {
    this.treeNodes = this.buildNodes(undefined);
    this.updateSelection();
  }

  private buildNodes(parentUuid: string): TreeNode[] {
    const nodes: TreeNode[] = [];

    for (const child of this.folderService.getChildren(this.fixtureFolders, this.fixtureItems, parentUuid)) {
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
        const item = child.item as PoolFixture;

        nodes.push({
          id: item.fixture.uuid,
          isFolder: false,
          iconClass: 'icon-' + this.fixtureService.getFixtureIconClass(this.fixtureService.getProfileByUuid(item.fixture.profileUuid)),
          fixture: item.fixture,
          item,
        });
      }
    }

    return nodes;
  }

  private updateSelection() {
    this.updateFocusedNode();

    // the fixture being edited is what the tree marks, unless the user selected several
    // rows here to drag them together
    if (this.selectedNodes.length > 1 && this.selectedNodes.some((node) => node.fixture === this.selectedFixture)) {
      return;
    }

    const fixtureNode = this.findNode(this.treeNodes, (node) => !!node.fixture && node.fixture === this.selectedFixture);

    this.selectedNodes = fixtureNode ? [fixtureNode] : [];
  }

  private updateFocusedNode() {
    this.focusedNode = this.findNode(this.treeNodes, (node) =>
      this.targetFolder ? node.folder === this.targetFolder : !!node.fixture && node.fixture === this.selectedFixture
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

  // the pool holds the fixtures of all universes, the ones outside the selected universe
  // are dimmed the same way the fixture panel dims what a preset does not use
  nodeClass = (node: TreeNode): string =>
    node.fixture && this.selectedUniverse && node.fixture.dmxUniverseUuid !== this.selectedUniverse.uuid ? 'inactive-list-item' : '';

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

    // the project is told about the new order on OK, the fixtures of the panel included
    this.fixtureOrderChanged = true;

    this.folderService.sortItems(this.fixtureFolders, this.fixtureItems);
    this.buildTree();
  }

  private applyNodes(nodes: TreeNode[], parentUuid: string) {
    nodes.forEach((node, index) => {
      if (node.folder) {
        node.folder.parentUuid = parentUuid;
        node.folder.sortIndex = index;
        this.applyNodes(node.children ?? [], node.folder.uuid);
      } else {
        node.item.folderUuid = parentUuid;
        node.item.sortIndex = index;
      }
    });
  }

  onNodeExpandedChange(node: TreeNode) {
    node.folder.expanded = node.expanded;
  }

  onActivate(node: TreeNode) {
    this.targetFolder = node.folder;

    if (node.fixture) {
      this.selectFixture(node.fixture);
    }

    this.updateSelection();
  }

  onSelectedNodesChange(nodes: TreeNode[]) {
    this.selectedNodes = nodes;
  }

  // one button for both directions, the same way the fixture panel does it
  allFoldersCollapsed(): boolean {
    return !this.fixtureFolders.some((folder) => folder.expanded !== false);
  }

  switchAllFoldersCollapsed() {
    const expanded = this.allFoldersCollapsed();

    for (const folder of this.fixtureFolders) {
      folder.expanded = expanded;
    }

    this.buildTree();
  }

  addFolder() {
    const parentUuid = this.targetFolder ? this.targetFolder.parentUuid : this.selectedItem()?.folderUuid;
    const sortIndex = this.nextSortIndex(parentUuid);

    const folder = this.folderService.createFolder(
      this.fixtureFolders,
      this.fixtureItems,
      this.translateService.instant('designer.fixture.new-folder'),
      parentUuid
    );

    folder.sortIndex = sortIndex;

    // the folder takes a place among the rows, which the project has to be told about
    this.fixtureOrderChanged = true;
    this.targetFolder = folder;
    this.buildTree();
  }

  // fixtures are removed with the button on their own row, so the trash only deletes a
  // folder here
  removeFolder() {
    if (!this.targetFolder) {
      return;
    }

    // the content of a folder is not deleted along with it, it moves up
    this.folderService.removeFolder(this.fixtureFolders, this.fixtureItems, this.targetFolder);

    this.fixtureOrderChanged = true;
    this.targetFolder = undefined;
    this.buildTree();
  }

  // the folder a fixture added to the pool goes into: the one the user last worked in
  private targetFolderUuid(): string {
    return this.targetFolder ? this.targetFolder.uuid : this.selectedItem()?.folderUuid;
  }

  private selectedItem(): PoolFixture {
    return this.fixtureItems.find((item) => item.fixture === this.selectedFixture);
  }

  // The end of a folder's content. The rows inherit their position from the fixture
  // panel, where a fixture with pixels takes several places, so counting the rows here
  // would land in the middle of the folder.
  private nextSortIndex(parentUuid: string): number {
    const children = this.folderService.getChildren(this.fixtureFolders, this.fixtureItems, parentUuid);

    return children.reduce((last, child) => Math.max(last, child.sortIndex), -1) + 1;
  }

  private addFixtureItem(fixture: Fixture, folderUuid: string) {
    this.fixtureItems.push({ fixture, folderUuid, sortIndex: this.nextSortIndex(folderUuid) });
    this.buildTree();
  }

  filterProfiles() {
    const keywords = (this.searchExpression || '')
      .toLowerCase()
      .split(' ')
      .filter((keyword) => keyword.length > 0);

    this.filteredProfiles = [];
    this.hiddenProfileCount = 0;

    for (const entry of this.searchIndex) {
      if (!keywords.every((keyword) => entry.text.indexOf(keyword) !== -1)) {
        continue;
      }

      // everything past the first matches is only counted: they are what makes the list
      // expensive, and a search this wide is refined rather than scrolled
      if (this.filteredProfiles.length < FixturePoolComponent.maxShownProfiles) {
        this.filteredProfiles.push(entry.profile);
      } else {
        this.hiddenProfileCount++;
      }
    }
  }

  addFixture(searchProfile: FixtureProfile) {
    // Load the profile details, if not already done. There is only a
    // minimal profile passed from the search.
    this.fixtureService.loadProfileByUuid(searchProfile.uuid).subscribe(() => {
      const profile = this.fixtureService.getProfileByUuid(searchProfile.uuid);
      const newFixture = this.fixtureService.addFixture(profile, this.fixturePool, this.currentUniverseFixtures);
      if (newFixture) {
        newFixture.dmxUniverseUuid = this.selectedUniverse?.uuid;
        this.addFixtureItem(newFixture, this.targetFolderUuid());
        this.selectFixture(newFixture);
      }
    });
  }

  addCopy(originalFixture: Fixture) {
    const fixture = new Fixture();

    fixture.uuid = this.uuidService.getUuid();
    fixture.profileUuid = originalFixture.profileUuid;
    fixture.name = originalFixture.name;
    fixture.modeShortName = originalFixture.modeShortName;
    fixture.dmxFirstChannel = originalFixture.dmxFirstChannel;
    fixture.dmxUniverseUuid = this.selectedUniverse?.uuid;

    this.fixturePool.push(fixture);

    // the copy joins the fixture it was made from
    this.addFixtureItem(fixture, this.fixtureItems.find((item) => item.fixture === originalFixture)?.folderUuid);
    this.selectFixture(fixture);
  }

  removeFixture(fixture: Fixture) {
    // the row of the fixture goes with it
    this.fixtureItems = this.fixtureItems.filter((item) => item.fixture.uuid !== fixture.uuid);

    for (let i = 0; i < this.fixturePool.length; i++) {
      if (this.fixturePool[i].uuid === fixture.uuid) {
        if (this.selectedFixture === this.fixturePool[i]) {
          this.selectFixture(undefined);
        }
        this.fixturePool.splice(i, 1);
        break;
      }
    }

    if (!this.selectedFixture) {
      this.selectFixture(this.currentUniverseFixtures[0] ?? undefined);
    }

    this.updateChannelMap();
    this.buildTree();

    // remove unused profiles
    for (let i = 0; i < this.projectService.project.fixtureProfiles.length; i++) {
      let profileUsed = false;

      for (const fixtureInPool of this.fixturePool) {
        if (fixtureInPool.profileUuid === this.projectService.project.fixtureProfiles[i].uuid) {
          profileUsed = true;
          break;
        }
      }

      if (!profileUsed) {
        this.projectService.project.fixtureProfiles.splice(i, 1);
      }
    }
  }

  // What the DMX map draws: the channels every fixture of the universe occupies, where
  // its run starts and ends, the ones of the fixture being edited and the ones two
  // fixtures collide on. Call it whenever the patch changes.
  updateChannelMap() {
    for (const channel of this.dmxChannels) {
      channel.occupied = false;
      channel.start = false;
      channel.end = false;
      channel.selected = false;
      channel.overlapped = false;
    }

    // fixtures may share their channels while they are the same lamp: same address,
    // same mode and same universe. Anything else on a channel is a collision.
    const lampOf: string[] = [];

    for (const fixture of this.channelFixtures) {
      const lamp = this.lampKey(fixture);
      const lastChannel = fixture.dmxFirstChannel + this.fixtureChannelCount(fixture) - 1;

      for (let i = fixture.dmxFirstChannel; i <= lastChannel && i < this.dmxChannels.length; i++) {
        const channel = this.dmxChannels[i];

        if (channel.occupied && lampOf[i] !== lamp) {
          channel.overlapped = true;
        } else if (!channel.occupied) {
          lampOf[i] = lamp;
        }

        channel.occupied = true;
      }

      if (fixture.dmxFirstChannel < this.dmxChannels.length) {
        this.dmxChannels[fixture.dmxFirstChannel].start = true;
      }

      if (lastChannel < this.dmxChannels.length) {
        this.dmxChannels[lastChannel].end = true;
      }
    }

    if (this.selectedFixture) {
      const lastChannel = this.selectedFixture.dmxFirstChannel + this.fixtureChannelCount(this.selectedFixture) - 1;

      for (let i = this.selectedFixture.dmxFirstChannel; i <= lastChannel && i < this.dmxChannels.length; i++) {
        this.dmxChannels[i].selected = true;
      }
    }

    this.drawChannelMap();
  }

  // the same lamp patched twice is not a collision, see updateChannelMap
  private lampKey(fixture: Fixture): string {
    return fixture.dmxFirstChannel + '/' + fixture.modeShortName + '/' + fixture.dmxUniverseUuid;
  }

  private fixtureChannelCount(fixture: Fixture): number {
    const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);

    return this.fixtureService.getModeChannelCount(profile, this.fixtureService.getModeByFixture(profile, fixture));
  }

  // do any two fixtures of the passed list share a channel without being the same lamp?
  private fixturesOverlap(fixtures: Fixture[]): boolean {
    const lampOf: string[] = [];

    for (const fixture of fixtures) {
      const lamp = this.lampKey(fixture);
      const lastChannel = fixture.dmxFirstChannel + this.fixtureChannelCount(fixture) - 1;

      for (let i = fixture.dmxFirstChannel; i <= lastChannel && i < this.dmxChannels.length; i++) {
        if (lampOf[i] === undefined) {
          lampOf[i] = lamp;
        } else if (lampOf[i] !== lamp) {
          return true;
        }
      }
    }

    return false;
  }

  channelMouseDown(event: MouseEvent) {
    // start dragging
    const selectedIndex = this.channelAt(event);
    let newSelectedFixture: Fixture;

    if (selectedIndex < 0) {
      return;
    }

    // find a dragging fixture and select it, but don't change the selection, if the
    // currently selected fixture might also be selected (on overlapped fixtures)
    for (const fixture of this.channelFixtures) {
      if (selectedIndex >= fixture.dmxFirstChannel && selectedIndex <= fixture.dmxFirstChannel + this.fixtureChannelCount(fixture) - 1) {
        if (this.selectedFixture === fixture) {
          newSelectedFixture = fixture;
          break;
        }

        if (!newSelectedFixture) {
          newSelectedFixture = fixture;
        }
      }
    }

    if (newSelectedFixture) {
      if (newSelectedFixture !== this.selectedFixture) {
        this.selectFixture(newSelectedFixture);
      }

      this.channelDragFixture = newSelectedFixture;
      this.channelDragOffset = selectedIndex - newSelectedFixture.dmxFirstChannel;
    }
  }

  // register mouse up globally (e.g. also outside the DMX mapping)
  @HostListener('window:mouseup', ['$event'])
  mouseUp(event: any) {
    // finish dragging
    this.channelDragFixture = undefined;
    this.channelDragOffset = undefined;
  }

  // the fixture being dragged over the map follows the cursor, as far as it fits
  private dragChannelTo(channel: number) {
    const firstChannel = channel - this.channelDragOffset;
    const channelCount = this.fixtureChannelCount(this.channelDragFixture);

    if (firstChannel >= 0 && firstChannel + channelCount <= this.dmxChannels.length) {
      this.channelDragFixture.dmxFirstChannel = firstChannel;
      this.updateChannelMap();
    }
  }

  // the address of the selected fixture, which the settings show counting from 1
  setFirstChannel(channel: number) {
    const firstChannel = Math.round(channel) - 1;

    this.selectedFixture.dmxFirstChannel = Math.min(Math.max(firstChannel, 0), this.dmxChannels.length - 1);
    this.updateChannelMap();
  }

  ok() {
    // don't allow OK if overlapping fixtures exist within any universe
    for (const universe of this.universes) {
      if (this.fixturesOverlap(this.fixturePool.filter((f) => f.dmxUniverseUuid === universe.uuid))) {
        const msg = 'designer.fixture-pool.channel-occupied';
        const title = 'designer.fixture-pool.channel-occupied-title';

        this.translateService.get([msg, title]).subscribe((result) => {
          this.toastrService.error(result[msg], result[title]);
        });

        return;
      }
    }

    // remove deleted fixtures/pixel keys from preset fixtures
    for (let i = this.projectService.project.presetFixtures.length - 1; i >= 0; i--) {
      let found = false;
      const presetFixture = this.projectService.project.presetFixtures[i];
      for (let fixture of this.fixturePool) {
        if (presetFixture.fixtureUuid === fixture.uuid) {
          found = true;
          break;
        }
      }
      if (!found) {
        this.projectService.project.presetFixtures.splice(i, 1);
      }
    }

    // If a mode is changed, we need to re-add the fixture to make sure, all pixel keys
    // are removed/added
    for (let projectFixture of this.projectService.project.fixtures) {
      for (let poolFixture of this.fixturePool) {
        if (poolFixture.profileUuid === projectFixture.profileUuid && poolFixture.modeShortName != projectFixture.modeShortName) {
          // the mode has changed -> remove it from the presetfixtures
          for (let i = this.projectService.project.presetFixtures.length - 1; i >= 0; i--) {
            const presetFixture = this.projectService.project.presetFixtures[i];
            if (presetFixture.fixtureUuid === poolFixture.uuid) {
              this.projectService.project.presetFixtures.splice(i, 1);
            }
          }
        }
      }
    }

    // the folders shown here are the project's own ones: hand them over before the new
    // fixtures are placed in them
    this.projectService.project.fixtureFolders = this.fixtureFolders;

    // add the new fixtures/pixel keys to the preset fixtures
    for (let fixture of this.fixturePool) {
      let found = false;
      for (let presetFixture of this.projectService.project.presetFixtures) {
        if (presetFixture.fixtureUuid === fixture.uuid) {
          found = true;
          break;
        }
      }
      if (!found) {
        // the fixture and its pixels appear in the folder the pool put the fixture in
        const folderUuid = this.fixtureItems.find((item) => item.fixture.uuid === fixture.uuid)?.folderUuid;

        if (this.fixtureService.fixtureHasGeneralChannel(fixture)) {
          this.addPresetFixture(fixture.uuid, folderUuid);
        }

        const pixels = this.fixtureService.fixtureGetUniquePixels(fixture);

        for (let pixel of pixels) {
          this.addPresetFixture(fixture.uuid, folderUuid, pixel.key);
        }
      }
    }

    this.applyFixtureOrder();

    this.projectService.project.fixtures = this.fixturePool;

    // Persist any locally edited universes back to the config when the
    // host application has opted in to free editing.
    if (this.configService.freeUniverseEdit) {
      this.configService.universes = this.universes;
    }

    this.fixtureService.updateCachedFixtures();
    this.presetService.removeDeletedFixtures();
    this.previewService.updateFixtureSetup();
    this.presetService.updateFixtureSelection();
    this.presetService.fixtureSelectionChanged.next();
    this.livePreviewService.previewLive();

    this.onClose.next(1);
    this.bsModalRef.hide();
  }

  // a fixture added to the pool appears at the end of the folder it was put in
  private addPresetFixture(fixtureUuid: string, folderUuid: string, pixelKey?: string) {
    const presetFixture = new PresetFixture();
    presetFixture.fixtureUuid = fixtureUuid;
    presetFixture.pixelKey = pixelKey;

    this.folderService.placeLast(
      this.projectService.project.fixtureFolders,
      this.projectService.project.presetFixtures,
      presetFixture,
      folderUuid
    );
    this.projectService.project.presetFixtures.push(presetFixture);
  }

  // What the tree did to the fixtures becomes the project's own order. A row here stands
  // for a fixture with all its pixels: they stay together and follow it into the folder
  // it was moved to, so only a tree the user actually moved something in is written back
  // - otherwise the panel keeps the order it gave the pixels.
  private applyFixtureOrder() {
    if (this.fixtureOrderChanged) {
      const rows = new Map<string, PresetFixture[]>();

      for (const presetFixture of this.projectService.project.presetFixtures) {
        const fixtureRows = rows.get(presetFixture.fixtureUuid);

        if (fixtureRows) {
          fixtureRows.push(presetFixture);
        } else {
          rows.set(presetFixture.fixtureUuid, [presetFixture]);
        }
      }

      const apply = (parentUuid: string) => {
        let sortIndex = 0;

        for (const child of this.folderService.getChildren(this.fixtureFolders, this.fixtureItems, parentUuid)) {
          if (child.folder) {
            child.folder.sortIndex = sortIndex++;
            apply(child.folder.uuid);
            continue;
          }

          const item = child.item as PoolFixture;

          item.sortIndex = sortIndex;

          for (const row of rows.get(item.fixture.uuid) ?? []) {
            row.folderUuid = parentUuid;
            row.sortIndex = sortIndex++;
          }

          // a fixture without a row of its own still keeps its place among the others
          sortIndex = Math.max(sortIndex, item.sortIndex + 1);
        }
      };

      apply(undefined);
      this.fixtureOrderService.sortProjectFixtures();
    } else {
      // the removed fixtures left gaps in the numbering of every folder they were in
      for (const folder of [undefined, ...this.fixtureFolders.map((candidate) => candidate.uuid)]) {
        this.folderService.renumber(this.fixtureFolders, this.projectService.project.presetFixtures, folder);
      }
    }

    // the flat fixture list of the pool follows the tree as well
    this.folderService.sortItems(this.fixtureFolders, this.fixtureItems);
    this.fixturePool = this.fixtureItems.map((item) => item.fixture);

    // the folders a preset positions and the order it chases in follow the project's
    this.fixtureOrderService.syncPresetOrders();
  }

  cancel() {
    this.onClose.next(2);
    this.bsModalRef.hide();
  }

  updateProfiles() {
    this.updatingProfiles = true;

    // TODO
    this.fixtureService
      .updateProfiles()
      .pipe(
        finalize(() => {
          this.updatingProfiles = false;
        }),
        catchError(() => {
          const msg = 'designer.fixture-pool.profiles-update-error';
          const title = 'designer.fixture-pool.profiles-update-error-title';

          this.translateService.get([msg, title]).subscribe((result) => {
            this.toastrService.error(result[msg], result[title]);
          });

          return undefined;
        })
      )
      .subscribe(() => {
        this.loadProfiles();

        const msg = 'designer.fixture-pool.profiles-updated';
        const title = 'designer.fixture-pool.profiles-updated-title';

        this.translateService.get([msg, title]).subscribe((result) => {
          this.toastrService.success(result[msg], result[title]);
        });
      });
  }

  openEditUniverses() {
    const ref = this.modalService.show(FixturePoolEditUniversesComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      initialState: { universes: structuredClone(this.universes) },
    });
    (ref.content as FixturePoolEditUniversesComponent).onClose.subscribe((result) => {
      if (!result) return;

      // Clear fixture universe assignments for any removed universe
      for (const universe of this.universes) {
        if (!result.find((u) => u.uuid === universe.uuid)) {
          for (const fixture of this.fixturePool) {
            if (fixture.dmxUniverseUuid === universe.uuid) {
              fixture.dmxUniverseUuid = undefined;
            }
          }
        }
      }

      this.universes = result;

      // Re-anchor selectedUniverse to the new object reference from result.
      // The modal works on a structuredClone, so all objects have new references.
      const stillSelected = this.universes.find((u) => u.uuid === this.selectedUniverse?.uuid);
      if (stillSelected) {
        this.selectedUniverse = stillSelected;
      } else {
        this.selectedUniverse = this.universes[0] ?? undefined;
        this.selectFixture(this.currentUniverseFixtures[0] ?? undefined);
      }

      this.updateChannelMap();
    });
  }

  createFixtureFromProfileFile() {
    const bsModalRef = this.modalService.show(FixturePoolCreateFromFileComponent, { keyboard: true, ignoreBackdropClick: false });
    (bsModalRef.content as FixturePoolCreateFromFileComponent).onClose.subscribe((profile: FixtureProfile) => {
      const newFixture = this.fixtureService.addFixture(profile, this.fixturePool, this.currentUniverseFixtures);
      if (newFixture) {
        newFixture.dmxUniverseUuid = this.selectedUniverse?.uuid;
        this.addFixtureItem(newFixture, this.targetFolderUuid());
      }
      this.selectFixture(newFixture);
    });
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    // enter confirms the name being typed (a folder, a fixture), not the whole dialog
    if (this.hotkeyTargetExcludeService.exclude(event)) {
      return;
    }

    this.ok();
  }
}
