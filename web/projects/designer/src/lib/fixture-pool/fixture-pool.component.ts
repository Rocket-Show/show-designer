import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { EMPTY, Subject, Subscription } from 'rxjs';
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
import { FixtureExchangeReport, FixtureExchangeService } from '../services/fixture-exchange.service';
import { FixtureMode } from '../models/fixture-mode';
import { getMaintenanceCapability, getMaintenanceHoldMillis, MaintenanceAction } from '../models/maintenance';
import {
  FixtureBetterVersion,
  FixtureStateBadge,
  FixtureVersion,
  getModeStateBadge,
  getStateBadgeKey,
  isGenerated,
  isVersionUuid,
} from '../models/fixture-version';
import { FixtureLibraryService } from '../services/fixture-library.service';
import { UserEnsureLoginService } from '../services/user-ensure-login.service';
import { UserService } from '../services/user.service';
import { FixtureAiComponent, FixtureAiResult } from '../fixture-library/fixture-ai/fixture-ai.component';
import { FixtureOfferComponent } from '../fixture-library/fixture-offer/fixture-offer.component';
import { FixtureMaintenanceConfirmComponent } from '../fixture-library/fixture-maintenance-confirm/fixture-maintenance-confirm.component';
import { ChannelFunction, getChannelFunctions } from '../models/channel-function';

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

// Where a fixture is patched, for its row in the tree: its channels, counted from 1, and whether another fixture of its
// universe is on one of them
export interface FixturePatch {
  count: number;
  first: number;
  last: number;
  overlapped: boolean;
}

// Two fixtures of the universe shown on the same channels (counted from 1), and where the later one of them would fit:
// the first channel of the first gap that takes it, 0 if there is none
export interface PatchCollision {
  fixture: Fixture;
  other: Fixture;
  first: number;
  last: number;
  free: number;
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
  @ViewChild('dmxFunctions') dmxFunctions: ElementRef<HTMLElement>;

  // where each fixture of the pool is patched (see FixturePatch), by its uuid
  public patches = new Map<string, FixturePatch>();

  // the fixtures of the universe shown which collide with another one, and how full the universe is
  public collisions: PatchCollision[] = [];
  public usedChannels = 0;
  public nextFreeChannel = 0;

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

  // The fixtures of the project changed to another model (profile) here, with the profile and the mode they were of.
  // What the presets set for the old model is carried over to the new one on OK (see FixtureExchangeService).
  private exchanges = new Map<string, { profileUuid: string; modeShortName: string }>();

  // what becomes of the values of the old model of the fixture edited, if it was changed to another one
  public exchangeReport: FixtureExchangeReport;
  public exchangedFrom: FixtureProfile;

  // the fixtures blinking to be told apart on the stage (see identify), while this dialog is open
  public identifiedFixtureUuids: string[] = [];

  // the better version the library has for the fixtures of each profile and mode, as far as it was looked up (see
  // FixtureLibraryService.checkVersions), worked out once for the rows of the tree
  private betterVersions = new Map<string, FixtureBetterVersion>();
  private versionsChanged: Subscription;

  // how many values the presets set which only the model of the fixture edited plays (see model-specific)
  public modelSpecificCount = 0;

  // The fixture library holds thousands of profiles, of which a list this size shows a
  // handful. Building a row for every one of them costs seconds and makes everything
  // the pool does afterwards slow, so the search shows the first matches and says how
  // many more there are.
  private static readonly maxShownProfiles = 50;

  // The map, in px: the column with the number of the first channel of each row, the line with the numbers of the
  // columns, a row, the taller rows of the fixture edited (its name, and below it what each of its channels does), the
  // room between two rows, and how narrow or wide a channel may be.
  private static readonly labelWidth = 36;
  private static readonly headerHeight = 16;
  private static readonly rowHeight = 24;
  private static readonly openRowHeight = 44;
  private static readonly openRowTitle = 20;
  private static readonly rowGap = 3;
  private static readonly minChannelWidth = 14;
  private static readonly maxChannelWidth = 40;

  // how many channels the map fits on a row and how wide they are, which follows the width it is given, and where its
  // rows are
  private channelsPerRow = 32;
  private channelWidth = 28;
  private rowTops: number[] = [];
  private rowHeights: number[] = [];

  // what the channels of each profile and mode do (see channelFunctionsOf)
  private channelFunctions = new Map<string, ChannelFunction[]>();

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
    public hardwarePromoService: HardwarePromoService,
    private fixtureExchangeService: FixtureExchangeService,
    private fixtureLibraryService: FixtureLibraryService,
    private userEnsureLoginService: UserEnsureLoginService,
    private userService: UserService
  ) {
    this.promoLink = this.hardwarePromoService.link('dmx-overview');

    // the versions of the fixtures arrived (or changed): the marks of a better version are worked out anew
    this.versionsChanged = this.fixtureLibraryService.versionsChanged.subscribe(() => this.betterVersions.clear());

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

      // The map lays its channels out over the width it is given. Drawing it sets its
      // height, which must not happen while the browser is still telling about the size
      // (it reports that as an error of the page).
      this.mapResized = new ResizeObserver(() => requestAnimationFrame(() => this.drawChannelMap()));
      this.mapResized.observe(this.dmxMap.nativeElement);
    });
  }

  ngOnDestroy() {
    this.versionsChanged.unsubscribe();
    this.endMaintenance();
    this.endIdentify();
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

  // the channel under the cursor, or -1 off the channels (the numbers around them, the gap between two rows)
  private channelAt(event: MouseEvent): number {
    const x = event.offsetX - FixturePoolComponent.labelWidth;
    const column = Math.floor(x / this.channelWidth);
    const row = this.rowTops.findIndex(
      (top, index) => event.offsetY >= top && event.offsetY < top + this.rowHeights[index] + FixturePoolComponent.rowGap
    );

    if (x < 0 || column >= this.channelsPerRow || row < 0) {
      return -1;
    }

    const channel = row * this.channelsPerRow + column;

    return channel < this.dmxChannels.length ? channel : -1;
  }

  // Where a channel sits on the map, in px from its top left corner. The rows the fixture selected takes are taller:
  // they show what each of its channels does.
  channelBox(channel: number): { x: number; y: number; width: number; height: number } {
    const row = Math.floor(channel / this.channelsPerRow);

    return {
      x: FixturePoolComponent.labelWidth + (channel % this.channelsPerRow) * this.channelWidth,
      y: this.rowTops[row],
      width: this.channelWidth,
      height: this.rowHeights[row],
    };
  }

  // The channel the cursor is on, in place of a tooltip: its number, and the fixture on it with the function of the
  // channel, e.g. "52 · Beam R · Strobe"
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

    const box = this.channelBox(channel);
    const fixture = this.fixtureOnChannel(channel);
    const parts = [String(channel + 1)];

    if (fixture) {
      parts.push(fixture.name);

      const name = this.channelFunctionsOf(fixture)[channel - fixture.dmxFirstChannel]?.name;

      if (name) {
        parts.push(name);
      }
    }

    label.textContent = parts.join(' · ');
    label.hidden = false;
    label.style.left = box.x + box.width / 2 + 'px';
    label.style.top = box.y + 'px';
  }

  // the fixture on a channel of the universe shown: the one edited, if it is one of them
  private fixtureOnChannel(channel: number): Fixture {
    let found: Fixture;

    for (const fixture of this.channelFixtures) {
      if (channel >= fixture.dmxFirstChannel && channel < fixture.dmxFirstChannel + this.fixtureChannelCount(fixture)) {
        if (fixture === this.selectedFixture) {
          return fixture;
        }

        found = found || fixture;
      }
    }

    return found;
  }

  // How the map is laid out over the width it is given: 32 channels on a row, or 16 or 8 where they wouldn't be wide
  // enough, the number of the first channel of each row in front of it, the numbers of the columns above.
  private layoutMap(width: number) {
    const space = width - FixturePoolComponent.labelWidth;

    this.channelsPerRow = [32, 16, 8].find((count) => space / count >= FixturePoolComponent.minChannelWidth) ?? 8;
    this.channelWidth = Math.max(1, Math.min(FixturePoolComponent.maxChannelWidth, Math.floor(space / this.channelsPerRow)));

    const rows = Math.ceil(this.dmxChannels.length / this.channelsPerRow);
    let top = FixturePoolComponent.headerHeight;

    this.rowTops = [];
    this.rowHeights = [];

    for (let row = 0; row < rows; row++) {
      const channels = this.dmxChannels.slice(row * this.channelsPerRow, (row + 1) * this.channelsPerRow);
      const height = channels.some((channel) => channel.selected) ? FixturePoolComponent.openRowHeight : FixturePoolComponent.rowHeight;

      this.rowTops.push(top);
      this.rowHeights.push(height);
      top += height + FixturePoolComponent.rowGap;
    }
  }

  // Draw the map: the numbers of the channels, the free ones, a labelled block per fixture of the universe, the one
  // edited with what each of its channels does, and the channels two fixtures collide on. The colours are the
  // stylesheet's, so the map is themed with everything else.
  private drawChannelMap() {
    const canvas = this.dmxCanvas?.nativeElement;
    const width = this.dmxMap?.nativeElement.clientWidth ?? 0;

    if (!canvas || !width) {
      return;
    }

    this.layoutMap(width);

    const labelWidth = FixturePoolComponent.labelWidth;
    const channelWidth = this.channelWidth;
    const lastRow = this.rowTops.length - 1;
    const mapWidth = labelWidth + this.channelsPerRow * channelWidth;
    const mapHeight = this.rowTops[lastRow] + this.rowHeights[lastRow];
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(mapWidth * ratio);
    canvas.height = Math.round(mapHeight * ratio);
    canvas.style.width = mapWidth + 'px';
    canvas.style.height = mapHeight + 'px';

    const context = canvas.getContext('2d');
    const style = getComputedStyle(this.dmxMap.nativeElement);
    const colour = (name: string) => style.getPropertyValue(name).trim();
    const font = style.fontFamily;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, mapWidth, mapHeight);

    // the numbers of the columns, and of the first channel of each row
    context.fillStyle = colour('--dmx-number');
    context.font = '10px ' + font;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    for (let column = 0; column < this.channelsPerRow; column++) {
      context.fillText(String(column + 1), labelWidth + (column + 0.5) * channelWidth, FixturePoolComponent.headerHeight / 2);
    }

    context.textAlign = 'right';

    for (let row = 0; row <= lastRow; row++) {
      context.fillText(String(row * this.channelsPerRow + 1), labelWidth - 8, this.rowTops[row] + this.rowHeights[row] / 2);
    }

    // the free channels
    context.fillStyle = colour('--dmx-free');

    for (let channel = 0; channel < this.dmxChannels.length; channel++) {
      if (!this.dmxChannels[channel].occupied) {
        const box = this.channelBox(channel);

        this.channelBar(context, box.x + 1.5, box.y, box.width - 3, box.height, true, true, 3);
        context.fill();
      }
    }

    // the fixtures, a block per row they take, the one edited on top
    const blocks = this.mapBlocks();

    for (const block of blocks) {
      const selected = block.fixture === this.selectedFixture;

      context.fillStyle = selected ? colour('--dmx-selected-fill') : colour('--dmx-fill');
      context.strokeStyle = selected ? colour('--dmx-selected-fill') : colour('--dmx-edge');
      context.lineWidth = 1;
      this.blockPath(context, block);
      context.fill();
      context.stroke();

      // the line between each channel of the one edited, below its name, where their functions are shown
      if (selected) {
        const box = this.channelBox(block.channel);

        context.strokeStyle = colour('--dmx-selected-line');

        for (let index = 1; index < block.length; index++) {
          const x = Math.round(box.x + index * channelWidth) + 0.5;

          context.beginPath();
          context.moveTo(x, box.y + FixturePoolComponent.openRowTitle);
          context.lineTo(x, box.y + box.height - 3);
          context.stroke();
        }
      }
    }

    // the channels two fixtures collide on, hatched over both
    context.fillStyle = this.hatch(context, colour('--dmx-overlap-fill')) || colour('--dmx-overlap-fill');
    context.strokeStyle = colour('--dmx-overlap-edge');

    for (let channel = 0; channel < this.dmxChannels.length; channel++) {
      if (!this.dmxChannels[channel].overlapped) {
        continue;
      }

      // one bar for the channels in a row which are collided on, up to the end of the row
      let length = 1;

      while (
        channel + length < this.dmxChannels.length &&
        this.dmxChannels[channel + length].overlapped &&
        (channel + length) % this.channelsPerRow !== 0
      ) {
        length++;
      }

      const box = this.channelBox(channel);

      this.channelBar(context, box.x + 1.5, box.y + 0.5, length * channelWidth - 3, box.height - 1, true, true, 3);
      context.fill();
      context.stroke();
      channel += length - 1;
    }

    // The names on the blocks, above the hatching, so a fixture colliding with another one can still be read. Where
    // another fixture starts on a block, its name goes no further: each name stays on the part of its block in view.
    for (const block of blocks) {
      const blockEnd = block.channel + block.length;
      const nextStart = blocks
        .filter((other) => other !== block && other.start && other.channel > block.channel && other.channel < blockEnd)
        .reduce((end, other) => Math.min(end, other.channel), blockEnd);

      this.blockLabel(context, { ...block, length: nextStart - block.channel }, colour, font);
    }

    this.showChannelFunctions();
  }

  // The blocks of the fixtures of the universe shown, the one edited last: a fixture which goes on past the end of a
  // row is a block on each row it takes
  private mapBlocks(): { fixture: Fixture; channel: number; length: number; start: boolean; end: boolean }[] {
    const blocks = [];
    const fixtures = this.channelFixtures.filter((fixture) => fixture !== this.selectedFixture);

    if (this.selectedFixture && this.channelFixtures.includes(this.selectedFixture)) {
      fixtures.push(this.selectedFixture);
    }

    for (const fixture of fixtures) {
      const first = fixture.dmxFirstChannel;
      const last = Math.min(first + this.fixtureChannelCount(fixture), this.dmxChannels.length) - 1;
      let channel = first;

      while (channel <= last) {
        const rowEnd = (Math.floor(channel / this.channelsPerRow) + 1) * this.channelsPerRow - 1;
        const end = Math.min(rowEnd, last);

        blocks.push({ fixture, channel, length: end - channel + 1, start: channel === first, end: end === last });
        channel = end + 1;
      }
    }

    return blocks;
  }

  private blockPath(context: CanvasRenderingContext2D, block: { channel: number; length: number; start: boolean; end: boolean }) {
    const box = this.channelBox(block.channel);

    this.channelBar(context, box.x + 1.5, box.y + 0.5, block.length * this.channelWidth - 3, box.height - 1, block.start, block.end, 5);
  }

  // the name of the fixture on its block and its channels at the right end, as far as they fit
  private blockLabel(
    context: CanvasRenderingContext2D,
    block: { fixture: Fixture; channel: number; length: number },
    colour: (name: string) => string,
    font: string
  ) {
    const box = this.channelBox(block.channel);
    const selected = block.fixture === this.selectedFixture;
    const left = box.x + 8;
    const right = box.x + block.length * this.channelWidth - 8;
    const y = selected ? box.y + FixturePoolComponent.openRowTitle / 2 + 1 : box.y + box.height / 2;
    const count = this.fixtureChannelCount(block.fixture);
    const range = block.fixture.dmxFirstChannel + 1 + '–' + (block.fixture.dmxFirstChannel + count);

    if (right - left < 12) {
      return;
    }

    context.textBaseline = 'middle';

    // the channels, if there is room for them next to a name
    context.font = '10px ' + font;
    context.fillStyle = selected ? colour('--dmx-selected-text') : colour('--dmx-text-muted');

    const rangeWidth = context.measureText(range).width;
    let nameRight = right;

    if (right - left > rangeWidth + 40) {
      context.textAlign = 'right';
      context.fillText(range, right, y);
      nameRight = right - rangeWidth - 8;
    }

    context.font = (selected ? '600 ' : '') + '11px ' + font;
    context.fillStyle = selected ? colour('--dmx-selected-text') : colour('--dmx-text');
    context.textAlign = 'left';
    context.fillText(this.fitText(context, block.fixture.name || '', nameRight - left), left, y);
  }

  // the text, cut short with an ellipsis where it is wider than the room it has
  private fitText(context: CanvasRenderingContext2D, text: string, width: number): string {
    if (context.measureText(text).width <= width) {
      return text;
    }

    let fitting = text;

    while (fitting.length > 0 && context.measureText(fitting + '…').width > width) {
      fitting = fitting.slice(0, -1);
    }

    return fitting.length > 0 ? fitting + '…' : '';
  }

  // the stripes the channels two fixtures collide on are filled with, undefined where the browser draws no pattern
  private hatch(context: CanvasRenderingContext2D, stripe: string): CanvasPattern {
    const tile = document.createElement('canvas');

    tile.width = 8;
    tile.height = 8;

    const tileContext = tile.getContext('2d');

    if (!tileContext) {
      return undefined;
    }

    tileContext.strokeStyle = stripe;
    tileContext.lineWidth = 3;
    tileContext.beginPath();
    tileContext.moveTo(-2, 10);
    tileContext.lineTo(10, -2);
    tileContext.moveTo(-2, 2);
    tileContext.lineTo(2, -2);
    tileContext.moveTo(6, 10);
    tileContext.lineTo(10, 6);
    tileContext.stroke();

    return context.createPattern(tile, 'repeat');
  }

  // What each channel of the fixture edited does, shown on its block as an icon (or a dot in the colour of a colour
  // channel). Only the channels of one fixture are built as elements; the map itself stays drawn.
  private showChannelFunctions() {
    const layer = this.dmxFunctions?.nativeElement;

    if (!layer) {
      return;
    }

    const fixture = this.selectedFixture;
    const parts: string[] = [];

    if (fixture && this.channelFixtures.includes(fixture)) {
      const functions = this.channelFunctionsOf(fixture);

      functions.forEach((channelFunction, index) => {
        const channel = fixture.dmxFirstChannel + index;

        if (channel >= this.dmxChannels.length || (!channelFunction.icon && !channelFunction.color)) {
          return;
        }

        const box = this.channelBox(channel);
        const place =
          'left:' +
          box.x +
          'px;top:' +
          (box.y + FixturePoolComponent.openRowTitle) +
          'px;width:' +
          box.width +
          'px;height:' +
          (box.height - FixturePoolComponent.openRowTitle - 3) +
          'px';
        const fine = channelFunction.fine ? ' dmx-function-fine' : '';

        parts.push(
          channelFunction.color
            ? '<span class="dmx-function' +
                fine +
                '" style="' +
                place +
                '"><i class="dmx-function-color" style="background:' +
                channelFunction.color +
                '"></i></span>'
            : '<span class="dmx-function ' + channelFunction.icon + fine + '" style="' + place + '"></span>'
        );
      });
    }

    layer.innerHTML = parts.join('');
  }

  // What each channel of the mode of a fixture does, in the order of its DMX channels, worked out once per profile and
  // mode: its name, e.g. "Pan fine", and how the map shows it
  private channelFunctionsOf(fixture: Fixture): ChannelFunction[] {
    const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
    const mode = profile && this.fixtureService.getModeByFixture(profile, fixture);
    const key = fixture.profileUuid + '/' + (mode?.shortName || mode?.name);

    if (!mode) {
      return [];
    }

    let functions = this.channelFunctions.get(key);

    if (!functions) {
      functions = getChannelFunctions(profile, mode, this.fixtureService);
      this.channelFunctions.set(key, functions);
    }

    return functions;
  }

  // a bar with the ends of the fixture rounded and the cuts left square
  private channelBar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    start: boolean,
    end: boolean,
    rounding: number
  ) {
    const radius = Math.min(rounding, height / 2, width / 2);
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
    this.updateExchangeReport();
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
  // would land in the middle of the folder. The same goes for the panel's own rows, once
  // a removed fixture left a gap in them.
  private nextSortIndex(parentUuid: string, folders: Folder[] = this.fixtureFolders, items: FolderItem[] = this.fixtureItems): number {
    const children = this.folderService.getChildren(folders, items, parentUuid);

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

  // Add a fixture of a version of the library: the one the search lists, or another one of its fixture. There is only
  // what the search needs of it, the profile is loaded unless the project has it already.
  addFixture(searchProfile: FixtureVersion, modeShortName?: string) {
    this.fixtureService.loadProfileByUuid(searchProfile.uuid).subscribe({
      next: (profile) => this.addFixtureOf(profile, modeShortName),
      error: () => this.profileLoadError(),
    });
  }

  // add a fixture of a profile of the project, in the passed mode, if it has it
  private addFixtureOf(profile: FixtureProfile, modeShortName?: string) {
    const newFixture = this.fixtureService.addFixture(profile, this.fixturePool, this.currentUniverseFixtures, modeShortName);

    if (newFixture) {
      newFixture.dmxUniverseUuid = this.selectedUniverse?.uuid;

      this.addFixtureItem(newFixture, this.targetFolderUuid());
      this.selectFixture(newFixture);
    }
  }

  // the library doesn't have the profile, e.g. a version newer than the library of a device
  private profileLoadError() {
    const msg = 'designer.fixture-library.load-error';
    const title = 'designer.fixture-library.load-error-title';

    this.translateService.get([msg, title]).subscribe((result) => {
      this.toastrService.error(result[msg], result[title]);
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

    // the profiles no fixture uses anymore are only removed on OK: the project still has
    // the fixture until then
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
    // same profile and mode and same universe. Anything else on a channel is a collision.
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

    if (this.selectedFixture && this.channelFixtures.includes(this.selectedFixture)) {
      const lastChannel = this.selectedFixture.dmxFirstChannel + this.fixtureChannelCount(this.selectedFixture) - 1;

      for (let i = this.selectedFixture.dmxFirstChannel; i <= lastChannel && i < this.dmxChannels.length; i++) {
        this.dmxChannels[i].selected = true;
      }
    }

    this.updatePatches();
    this.drawChannelMap();

    // the fixtures being identified are found on their new channels right away
    this.livePreviewIdentify();
  }

  // Where each fixture of the pool is patched, which fixtures of the universe shown collide, and how full it is. The
  // collisions of the other universes are marked in the tree as well, they keep the dialog from closing.
  private updatePatches() {
    this.patches.clear();
    this.collisions = [];

    const byUniverse = new Map<string, Fixture[]>();

    for (const fixture of this.fixturePool) {
      const fixtures = byUniverse.get(fixture.dmxUniverseUuid) || [];

      fixtures.push(fixture);
      byUniverse.set(fixture.dmxUniverseUuid, fixtures);
    }

    byUniverse.forEach((fixtures) => {
      // the fixture first on each channel, the ones after it collide with it unless they are the same lamp
      const firstOn: Fixture[] = [];

      for (const fixture of fixtures) {
        const count = this.fixtureChannelCount(fixture);
        const first = fixture.dmxFirstChannel;
        const patch: FixturePatch = { count, first: first + 1, last: first + count, overlapped: false };
        let collision: PatchCollision;

        this.patches.set(fixture.uuid, patch);

        for (let channel = first; channel < first + count && channel < this.dmxChannels.length; channel++) {
          const other = firstOn[channel];

          if (!other) {
            firstOn[channel] = fixture;
          } else if (this.lampKey(other) !== this.lampKey(fixture)) {
            patch.overlapped = true;
            this.patches.get(other.uuid).overlapped = true;

            if (collision?.other === other) {
              collision.last = channel + 1;
            } else if (!collision) {
              collision = { fixture, other, first: channel + 1, last: channel + 1, free: 0 };
            }
          }
        }

        if (collision && this.channelFixtures.includes(fixture)) {
          this.collisions.push(collision);
        }
      }
    });

    // where the later fixture of each collision would fit, and how full the universe shown is
    for (const collision of this.collisions) {
      collision.free = this.freeChannelFor(collision.fixture) + 1;
    }

    this.usedChannels = this.dmxChannels.filter((channel) => channel.occupied).length;
    this.nextFreeChannel = this.dmxChannels.findIndex((channel) => !channel.occupied) + 1;
  }

  // the first channel of the first gap of the universe shown the fixture fits in, the fixture itself left out, or -1
  private freeChannelFor(fixture: Fixture): number {
    const count = this.fixtureChannelCount(fixture);
    const taken: boolean[] = [];

    for (const other of this.channelFixtures) {
      if (other !== fixture) {
        for (let channel = other.dmxFirstChannel; channel < other.dmxFirstChannel + this.fixtureChannelCount(other); channel++) {
          taken[channel] = true;
        }
      }
    }

    let gap = 0;

    for (let channel = 0; channel < this.dmxChannels.length; channel++) {
      gap = taken[channel] ? 0 : gap + 1;

      if (gap === count) {
        return channel - count + 1;
      }
    }

    return -1;
  }

  // the fix a collision offers: the fixture moves to the first gap it fits in
  moveToFree(collision: PatchCollision) {
    if (collision.free > 0) {
      collision.fixture.dmxFirstChannel = collision.free - 1;
      this.updateChannelMap();
    }
  }

  // the same lamp patched twice is not a collision, see updateChannelMap. Two profiles
  // can name their modes the same, so the profile is part of what makes it the same lamp.
  private lampKey(fixture: Fixture): string {
    return fixture.dmxFirstChannel + '/' + fixture.profileUuid + '/' + fixture.modeShortName + '/' + fixture.dmxUniverseUuid;
  }

  // ---- changing fixtures to another model --------------------------------------

  // what a profile is called: its manufacturer and its name, as far as it knows them
  profileName(profile: FixtureProfile): string {
    return [profile.manufacturerName, profile.name].filter((part) => part).join(' - ');
  }

  // the fixtures the buttons act on: the ones selected in the tree, or else the one edited
  get actedOnFixtures(): Fixture[] {
    const selected = this.selectedNodes.filter((node) => node.fixture).map((node) => node.fixture as Fixture);

    return selected.length > 0 ? selected : this.selectedFixture ? [this.selectedFixture] : [];
  }

  // The mode of the new model a fixture is given: the one with as many channels as the mode it was in (so it fits its
  // address), else the one the other fixtures of the profile are in, else the first one
  private getExchangeMode(profile: FixtureProfile, channelCount: number, modeShortName: string): FixtureMode {
    // (another version of the same fixture has the mode of the same name)
    const sameSize =
      profile.modes.find(
        (mode) => this.fixtureService.getModeChannelCount(profile, mode) === channelCount && (mode.shortName || mode.name) === modeShortName
      ) || profile.modes.find((mode) => this.fixtureService.getModeChannelCount(profile, mode) === channelCount);
    const others = this.fixturePool.find((fixture) => fixture.profileUuid === profile.uuid);
    const ofOthers = others && this.fixtureService.getModeByFixture(profile, others);

    return sameSize || ofOthers || profile.modes[0];
  }

  // Change the fixtures acted on (or the ones passed) to the passed profile from the library, e.g. the model the venue
  // has, or another version of the profile they are of
  exchangeProfile(searchProfile: FixtureVersion, fixtures: Fixture[] = this.actedOnFixtures) {
    if (fixtures.length === 0) {
      return;
    }

    this.fixtureService.loadProfileByUuid(searchProfile.uuid).subscribe({
      next: (profile) => this.exchangeTo(profile, fixtures),
      error: () => this.profileLoadError(),
    });
  }

  private exchangeTo(profile: FixtureProfile, fixtures: Fixture[]) {
    for (const fixture of fixtures) {
      const oldProfile = this.fixtureService.getProfileByUuid(fixture.profileUuid);

      if (!profile.modes.length || oldProfile === profile) {
        continue;
      }

      // a fixture of the project remembers what it was, one added here has nothing to carry over
      const projectFixture = this.projectService.project.fixtures.find((candidate) => candidate.uuid === fixture.uuid);

      if (projectFixture && !this.exchanges.has(fixture.uuid)) {
        this.exchanges.set(fixture.uuid, { profileUuid: projectFixture.profileUuid, modeShortName: projectFixture.modeShortName });
      }

      const mode = this.getExchangeMode(profile, oldProfile ? this.fixtureChannelCount(fixture) : 0, fixture.modeShortName);

      // a fixture still named after its model is named after the new one
      if (oldProfile && fixture.name === oldProfile.name) {
        fixture.name = profile.name;
      }

      fixture.profileUuid = profile.uuid;
      fixture.modeShortName = mode.shortName || mode.name;

      // changed back to what it was
      const origin = this.exchanges.get(fixture.uuid);

      if (origin && origin.profileUuid === fixture.profileUuid) {
        this.exchanges.delete(fixture.uuid);
      }
    }

    this.buildTree();
    this.selectFixture(this.selectedFixture);
    this.livePreviewIdentify();
  }

  // the mode of the fixture edited, which also decides what its old values are carried to
  selectMode(modeShortName: string) {
    this.selectedFixture.modeShortName = modeShortName;
    this.updateChannelMap();
    this.updateExchangeReport();
  }

  private updateExchangeReport() {
    this.exchangeReport = undefined;
    this.exchangedFrom = undefined;
    this.modelSpecificCount = 0;

    for (const preset of this.projectService.project.presets) {
      for (const value of this.presetService.getModelSpecificValues(preset)) {
        if (value.profile === this.selectedFixtureProfile) {
          this.modelSpecificCount += value.count;
        }
      }
    }

    const origin = this.selectedFixture && this.exchanges.get(this.selectedFixture.uuid);

    if (!origin || !this.selectedFixtureProfile) {
      return;
    }

    const fromProfile = this.fixtureService.getProfileByUuid(origin.profileUuid);

    if (!fromProfile) {
      return;
    }

    this.exchangedFrom = fromProfile;
    this.exchangeReport = this.fixtureExchangeService.exchange(
      this.projectService.project.presets,
      fromProfile,
      this.fixtureService.getModeByFixture(fromProfile, new Fixture({ modeShortName: origin.modeShortName })),
      this.selectedFixtureProfile,
      this.fixtureService.getModeByFixture(this.selectedFixtureProfile, this.selectedFixture),
      false
    );
  }

  // What the presets set for the old models of the fixtures changed to another one goes over to the new models, once
  // for each pair of them, and the pixels of the fixtures in the presets become the ones at the same place
  private applyExchanges() {
    const applied: string[] = [];

    for (const [fixtureUuid, origin] of this.exchanges) {
      const fixture = this.fixturePool.find((candidate) => candidate.uuid === fixtureUuid);
      const fromProfile = this.fixtureService.getProfileByUuid(origin.profileUuid);
      const toProfile = fixture && this.fixtureService.getProfileByUuid(fixture.profileUuid);

      if (!fixture || !fromProfile || !toProfile) {
        continue;
      }

      const fromMode = this.fixtureService.getModeByFixture(fromProfile, new Fixture({ modeShortName: origin.modeShortName }));
      const toMode = this.fixtureService.getModeByFixture(toProfile, fixture);
      const pair = [fromProfile.uuid, origin.modeShortName, toProfile.uuid, fixture.modeShortName].join('/');

      if (applied.indexOf(pair) < 0) {
        applied.push(pair);
        this.fixtureExchangeService.exchange(this.projectService.project.presets, fromProfile, fromMode, toProfile, toMode, true);
      }

      const pixelKeys = this.fixtureExchangeService.getPixelKeyMap(fromProfile, fromMode, toProfile, toMode);

      for (const preset of this.projectService.project.presets) {
        for (const presetFixture of preset.fixtures) {
          if (presetFixture.fixtureUuid === fixtureUuid && presetFixture.pixelKey && pixelKeys.has(presetFixture.pixelKey)) {
            presetFixture.pixelKey = pixelKeys.get(presetFixture.pixelKey);
          }
        }
      }
    }
  }

  // Patch the fixtures acted on one after another, in the order of the tree, from the lowest address among them on
  patchInARow() {
    const order = this.fixtureItems.map((item) => item.fixture);
    const fixtures = this.actedOnFixtures.slice().sort((fixture1, fixture2) => order.indexOf(fixture1) - order.indexOf(fixture2));

    if (fixtures.length < 2) {
      return;
    }

    let channel = Math.min(...fixtures.map((fixture) => fixture.dmxFirstChannel));
    const total = fixtures.reduce((sum, fixture) => sum + this.fixtureChannelCount(fixture), 0);

    if (channel + total > this.dmxChannels.length) {
      const msg = 'designer.fixture-pool.patch-in-a-row-full';
      const title = 'designer.fixture-pool.channel-occupied-title';

      this.translateService.get([msg, title]).subscribe((result) => {
        this.toastrService.error(result[msg], result[title]);
      });

      return;
    }

    for (const fixture of fixtures) {
      fixture.dmxFirstChannel = channel;
      channel += this.fixtureChannelCount(fixture);
    }

    this.updateChannelMap();
  }

  // ---- the fixture library: versions, votes, the AI ------------------------------

  // The versions of the fixture of a profile, to change to: of a version of the library, and of the copy of an older
  // project (a plain uuid names its fixture), whose fixtures have a version once they changed to one. A profile from a
  // file is of no fixture of the library.
  hasVersions(profile: FixtureProfile): boolean {
    return !profile.createdFromFile;
  }

  // What the badge of a mode of the profile edited says (see FixtureVersionBadgesComponent), where the mode is chosen:
  // the badge and the key of its translation
  modeBadge(mode: FixtureMode): { badge: FixtureStateBadge; key: string } {
    const badge = getModeStateBadge(this.selectedFixtureProfile, mode.shortName || mode.name);

    return badge ? { badge, key: getStateBadgeKey(badge) } : undefined;
  }

  // The better version the library has for a fixture, if there is one: its mode is a problem, its version is hidden or
  // the best version does its mode differently (see FixtureLibraryService.getBetterVersion)
  getBetterVersion(fixture: Fixture): FixtureBetterVersion {
    const key = fixture.profileUuid + '/' + fixture.modeShortName;

    if (!this.betterVersions.has(key)) {
      this.betterVersions.set(key, this.fixtureLibraryService.getBetterVersion(fixture));
    }

    return this.betterVersions.get(key);
  }

  // the mark of a better version: the fixture is changed to it, which tells what is carried over and what is lost
  exchangeToBetter(fixture: Fixture) {
    const better = this.getBetterVersion(fixture);

    this.targetFolder = undefined;
    this.selectedNodes = [];
    this.selectFixture(fixture);
    this.exchangeProfile(better.version, [fixture]);
  }

  // can the AI be asked for a profile, or to improve one: for a logged in user, or where the host holds the account
  get canUseAi(): boolean {
    return this.configService.aiFixtures && (this.configService.aiAccount === 'host' || this.userService.isLoggedIn());
  }

  // "Create profile with AI", or improve a version of the library (parent): the fixtures acted on change to the
  // improved version (exchange), else a fixture of the profile is added
  createProfileWithAi(parent?: FixtureVersion, exchange = false) {
    this.userEnsureLoginService.login().subscribe(() => {
      const ref = this.modalService.show(FixtureAiComponent, {
        keyboard: false,
        ignoreBackdropClick: true,
        class: 'modal-lg',
        initialState: { parent, exchange },
      });

      (ref.content as FixtureAiComponent).onClose.subscribe((result: FixtureAiResult) => {
        if (!result) {
          return;
        }

        if (!result.profile) {
          this.addFixture({ uuid: result.uuid }, result.mode);
        } else if (exchange) {
          this.exchangeTo(result.profile, this.actedOnFixtures);
        } else {
          this.addFixtureOf(result.profile, result.mode);
        }
      });
    });
  }

  // Offering a profile from a file to the library is switched off for now (decided on 2026-11-13): this switch turns it
  // on again, for the users with an account
  static offerEnabled = false;

  // a profile from a file can be offered to the library by a user with an account
  canOffer(profile: FixtureProfile): boolean {
    return FixturePoolComponent.offerEnabled && profile.createdFromFile && !isVersionUuid(profile.uuid) && this.configService.hasAccount();
  }

  // "Offer to the library": the fixtures of the profile from the file change to the version of the library it became
  offerProfile(profile: FixtureProfile) {
    const ref = this.modalService.show(FixtureOfferComponent, { keyboard: true, ignoreBackdropClick: false, initialState: { profile } });

    (ref.content as FixtureOfferComponent).onClose.subscribe((version: FixtureProfile) => {
      if (version) {
        this.exchangeTo(
          version,
          this.fixturePool.filter((fixture) => fixture.profileUuid === profile.uuid)
        );
      }
    });
  }

  // ---- identifying fixtures on the stage ------------------------------------

  isIdentified(fixture: Fixture): boolean {
    return this.identifiedFixtureUuids.indexOf(fixture.uuid) >= 0;
  }

  // let a fixture blink at full white in the preview and on the stage, or stop it
  switchIdentify(fixture: Fixture) {
    if (this.isIdentified(fixture)) {
      this.identifiedFixtureUuids = this.identifiedFixtureUuids.filter((uuid) => uuid !== fixture.uuid);
    } else {
      this.identifiedFixtureUuids = [...this.identifiedFixtureUuids, fixture.uuid];
    }

    this.projectService.project.identifyFixtureUuids = this.identifiedFixtureUuids;

    if (this.identifiedFixtureUuids.length > 0) {
      this.livePreviewIdentify();
    } else {
      this.endIdentify();
      this.livePreviewService.previewLive();
    }
  }

  // The stage shows the patch edited here while fixtures are identified, e.g. a fixture just moved to its address
  private livePreviewIdentify() {
    if (this.identifiedFixtureUuids.length > 0) {
      this.livePreviewService.previewPatch(this.fixturePool);
    }
  }

  // nothing is identified anymore: the stage shows the patch of the project again
  private endIdentify() {
    this.identifiedFixtureUuids = [];

    if (this.projectService.project) {
      this.projectService.project.identifyFixtureUuids = [];
    }

    if (this.maintenanceTimers.size === 0) {
      this.livePreviewService.endPatchPreview();
    }
  }

  // ---- asking fixtures to reset themselves or to switch their lamp on -------

  // the fixtures doing it right now, until they have held it for as long as they ask for (see maintenance)
  private maintenanceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // how long the maintenance capabilities of each mode of a profile are held, undefined if it has none
  private maintenanceHolds = new Map<string, number>();

  private maintenanceKey(fixture: Fixture, action: MaintenanceAction): string {
    return action + ':' + fixture.uuid;
  }

  // how long the fixture has to be asked to do the passed action, or undefined if it can't (e.g. an LED par has no
  // lamp to switch on)
  getMaintenanceHold(fixture: Fixture, action: MaintenanceAction): number {
    const key = action + ':' + fixture.profileUuid + ':' + fixture.modeShortName;

    if (!this.maintenanceHolds.has(key)) {
      const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
      const mode = profile ? this.fixtureService.getModeByFixture(profile, fixture) : undefined;
      const found = mode ? getMaintenanceCapability(this.fixtureService.getCachedChannels(profile, mode, null), action) : undefined;

      this.maintenanceHolds.set(
        key,
        found && found.capability.centerValue !== undefined ? getMaintenanceHoldMillis(found.capability) : undefined
      );
    }

    return this.maintenanceHolds.get(key);
  }

  canMaintain(fixture: Fixture, action: MaintenanceAction): boolean {
    return this.getMaintenanceHold(fixture, action) !== undefined;
  }

  isMaintaining(fixture: Fixture, action: MaintenanceAction): boolean {
    return this.maintenanceTimers.has(this.maintenanceKey(fixture, action));
  }

  // Ask the fixture on the stage to reset itself or to switch its lamp on. A profile of the AI or a user may have the
  // channel or the range wrong: the user is shown what is sent and asked first, once per project and profile.
  maintain(fixture: Fixture, action: MaintenanceAction) {
    const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);

    // (a fixture which can't do it isn't asked either)
    if (!this.canMaintain(fixture, action) || !isGenerated(profile) || profile.confirmedMaintenance.indexOf(action) >= 0) {
      this.startMaintenance(fixture, action);
      return;
    }

    const mode = this.fixtureService.getModeByFixture(profile, fixture);
    const found = getMaintenanceCapability(this.fixtureService.getCachedChannels(profile, mode, null), action);
    const ref = this.modalService.show(FixtureMaintenanceConfirmComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      initialState: {
        action,
        profile,
        channelName: found.channel.name,
        range: found.capability.capability.dmxRange,
        label: found.capability.capability.comment,
      },
    });

    (ref.content as FixtureMaintenanceConfirmComponent).onClose.subscribe((confirmed: boolean) => {
      if (confirmed) {
        profile.confirmedMaintenance.push(action);
        this.startMaintenance(fixture, action);
      }
    });
  }

  // the value is held for as long as the fixture asks for (three seconds at least), then the fixture plays the presets
  // again
  private startMaintenance(fixture: Fixture, action: MaintenanceAction) {
    const hold = this.getMaintenanceHold(fixture, action);

    const key = this.maintenanceKey(fixture, action);

    if (hold === undefined || this.maintenanceTimers.has(key)) {
      return;
    }

    this.maintenanceTimers.set(
      key,
      setTimeout(() => {
        this.maintenanceTimers.delete(key);
        this.updateMaintenance();
      }, Math.max(hold, 3000) + 500)
    );
    this.updateMaintenance();
  }

  // tell the stage which fixtures do what
  private updateMaintenance() {
    const project = this.projectService.project;

    if (!project) {
      return;
    }

    const fixturesOf = (action: MaintenanceAction) =>
      Array.from(this.maintenanceTimers.keys())
        .filter((key) => key.startsWith(action + ':'))
        .map((key) => key.substring(action.length + 1));

    project.resetFixtureUuids = fixturesOf('reset');
    project.lampOnFixtureUuids = fixturesOf('lamp-on');

    if (this.maintenanceTimers.size > 0 || this.identifiedFixtureUuids.length > 0) {
      this.livePreviewService.previewPatch(this.fixturePool);
    } else {
      this.livePreviewService.endPatchPreview();
    }
  }

  // the dialog closes: nothing is asked of the fixtures anymore
  private endMaintenance() {
    this.maintenanceTimers.forEach((timer) => clearTimeout(timer));
    this.maintenanceTimers.clear();

    if (this.projectService.project) {
      this.projectService.project.resetFixtureUuids = [];
      this.projectService.project.lampOnFixtureUuids = [];
    }
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

    // what the presets set for the old models of the fixtures changed to another one goes over to the new ones
    this.applyExchanges();

    // If a mode (or the model) is changed, we need to re-add the fixture to make sure, all pixel keys
    // are removed/added
    for (let projectFixture of this.projectService.project.fixtures) {
      for (let poolFixture of this.fixturePool) {
        if (
          poolFixture.uuid === projectFixture.uuid &&
          (poolFixture.modeShortName != projectFixture.modeShortName || poolFixture.profileUuid !== projectFixture.profileUuid)
        ) {
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

    // remove the profiles no fixture uses anymore
    this.projectService.project.fixtureProfiles = this.projectService.project.fixtureProfiles.filter((profile) =>
      this.fixturePool.some((fixture) => fixture.profileUuid === profile.uuid)
    );

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
    this.endIdentify();
    this.livePreviewService.previewLive();

    this.onClose.next(1);
    this.bsModalRef.hide();
  }

  // a fixture added to the pool appears at the end of the folder it was put in
  private addPresetFixture(fixtureUuid: string, folderUuid: string, pixelKey?: string) {
    const presetFixture = new PresetFixture();
    presetFixture.fixtureUuid = fixtureUuid;
    presetFixture.pixelKey = pixelKey;
    presetFixture.folderUuid = folderUuid;
    presetFixture.sortIndex = this.nextSortIndex(
      folderUuid,
      this.projectService.project.fixtureFolders,
      this.projectService.project.presetFixtures
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

      // the rows of the new fixtures were added at the end of the list, the order the
      // presets chase in has them in their folder
      this.fixtureOrderService.sortProjectFixtures();
    }

    // the flat fixture list of the pool follows the tree as well
    this.folderService.sortItems(this.fixtureFolders, this.fixtureItems);
    this.fixturePool = this.fixtureItems.map((item) => item.fixture);

    // the folders a preset positions and the order it chases in follow the project's
    this.fixtureOrderService.syncPresetOrders();
  }

  cancel() {
    // the stage shows the patch of the project again, if it showed the one edited here
    if (this.identifiedFixtureUuids.length > 0) {
      this.endIdentify();
      this.livePreviewService.previewLive();
    }

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

          return EMPTY;
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
      // closed without a file
      if (!profile) {
        return;
      }

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

    // nor a dialog opened on top of this one (the universes, a profile file)
    if (this.modalService.getModalsCount() > 1) {
      return;
    }

    this.ok();
  }
}
