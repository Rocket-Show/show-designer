import {
  AfterViewInit,
  Component,
  DoCheck,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { PresetFixture } from '../../models/preset-fixture';
import { FixturePixelGroupResolveService } from '../../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../../services/fixture.service';

// a pixel of the matrix where the grid shows it, with the row of the fixture list which
// controls it (none, where the mode controls the pixel through a group only)
export interface PixelGridCell {
  key: string;
  column: number;
  row: number;
  presetFixture?: PresetFixture;
}

// a group of pixels the fixture library defines (e.g. "Inner ring"), with the rows of
// its pixels
export interface PixelGridGroup {
  name: string;
  rows: PresetFixture[];
}

// rows taken or released at once, e.g. the pixels dragged over
export interface PixelGridSelection {
  rows: PresetFixture[];
  selected: boolean;
}

// the space a pixel takes at most and at least, in CSS pixels
const MAX_PITCH = 14;
const MIN_PITCH = 3;

// how the cells look: taken, not taken, and a pixel which has no row of its own
const SELECTED_COLOR = '#fd7e14';
const UNSELECTED_COLOR = 'rgba(255, 255, 255, 0.14)';
const WITHOUT_ROW_COLOR = 'rgba(255, 255, 255, 0.05)';

// The pixels of a fixture in the fixture list, where they sit in its matrix: a strip for
// a bar, a grid for a matrix (the layers of a cube next to each other). A click takes a
// pixel for the preset or releases it, a drag does the same for all pixels it passes. The
// groups of the fixture library take their pixels at once, and the rows which are no
// pixel of the matrix (the general channels, the groups the mode controls as one) are
// taken one by one.
@Component({
  selector: 'lib-app-fixture-pixel-grid',
  templateUrl: './fixture-pixel-grid.component.html',
  styleUrls: ['./fixture-pixel-grid.component.css'],
  standalone: false,
})
export class FixturePixelGridComponent implements OnChanges, DoCheck, AfterViewInit, OnDestroy {
  @Input() fixtureUuid: string;

  // the rows of the fixture in the list, in the order they are chased in
  @Input() rows: PresetFixture[] = [];

  // whether the preset (or the settings) took a row
  @Input() isSelected: (row: PresetFixture) => boolean = () => false;

  @Output() selectRows = new EventEmitter<PixelGridSelection>();

  @ViewChild('grid') gridRef: ElementRef<HTMLCanvasElement>;

  cells: PixelGridCell[] = [];
  columns = 0;
  gridRows = 0;

  // the rows which are no pixel of the matrix
  otherRows: PresetFixture[] = [];
  groups: PixelGridGroup[] = [];

  // the pixel under the mouse, named in the tooltip
  hoveredKey = '';

  private cellAt = new Map<string, PixelGridCell>();
  private selected = new Set<PresetFixture>();
  private selectionSignature = '';
  private pitch = MAX_PITCH;
  private drawnWidth = -1;

  // while a drag goes on: whether the pixels it passes are taken or released, and which
  // ones it passed so far
  private painting: boolean = undefined;
  private painted = new Set<PresetFixture>();

  private resizeObserver: ResizeObserver;

  constructor(
    private fixtureService: FixtureService,
    private fixturePixelGroupResolveService: FixturePixelGroupResolveService,
    private elementRef: ElementRef<HTMLElement>,
    private ngZone: NgZone
  ) {}

  // ---- the layout ----------------------------------------------------------

  ngOnChanges() {
    this.layout();
    this.updateSelection(true);
  }

  // the selection changes in many places (the rows, the settings, another preset), so it
  // is looked at in each check: it only takes a lookup per pixel
  ngDoCheck() {
    this.updateSelection(false);
  }

  ngAfterViewInit() {
    this.draw();

    if (typeof ResizeObserver !== 'undefined') {
      // the panel gets wider or narrower: the pixels as well
      this.ngZone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => requestAnimationFrame(() => this.resized()));
        this.resizeObserver.observe(this.elementRef.nativeElement);
      });
    }
  }

  // only a new width changes the pixels (the grid itself makes the panel taller)
  private resized() {
    if (this.elementRef.nativeElement.clientWidth !== this.drawnWidth) {
      this.draw();
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private layout() {
    this.cells = [];
    this.cellAt.clear();
    this.otherRows = [];
    this.groups = [];
    this.columns = 0;
    this.gridRows = 0;

    const fixture = this.fixtureUuid ? this.fixtureService.getFixtureByUuid(this.fixtureUuid) : undefined;
    const profile = fixture ? this.fixtureService.getProfileByUuid(fixture.profileUuid) : undefined;
    const rows = this.rows || [];

    if (!profile?.matrix) {
      this.otherRows = rows.slice();
      return;
    }

    const pixels = this.fixtureService.getAllPixelKeys(profile);
    const rowByKey = new Map<string, PresetFixture>();
    let width = 0;
    let height = 0;

    for (const row of rows) {
      if (row.pixelKey && !rowByKey.has(row.pixelKey)) {
        rowByKey.set(row.pixelKey, row);
      }
    }

    for (const pixel of pixels) {
      width = Math.max(width, pixel.x);
      height = Math.max(height, pixel.y);
    }

    for (const pixel of pixels) {
      // the layers of a cube next to each other, a column apart
      const cell: PixelGridCell = {
        key: pixel.key,
        column: (pixel.z - 1) * (width + 1) + pixel.x - 1,
        row: pixel.y - 1,
        presetFixture: rowByKey.get(pixel.key),
      };

      this.cells.push(cell);
      this.cellAt.set(cell.column + ',' + cell.row, cell);
      this.columns = Math.max(this.columns, cell.column + 1);
      this.gridRows = Math.max(this.gridRows, cell.row + 1);
    }

    const pixelKeys = new Set(pixels.map((pixel) => pixel.key));

    this.otherRows = rows.filter((row) => !row.pixelKey || !pixelKeys.has(row.pixelKey));

    const pixelRows = this.cells.filter((cell) => !!cell.presetFixture).length;

    for (const name of Object.keys(profile.matrix.pixelGroups || {})) {
      const groupRows = this.fixturePixelGroupResolveService
        .resolveGroupPixels(profile.matrix.pixelGroups[name], pixels)
        .map((pixel) => rowByKey.get(pixel.key))
        .filter((row) => !!row);

      // a group the mode controls as one is a row of its own (see otherRows), and the
      // checkbox of the fixture already takes all of its pixels
      if (groupRows.length > 0 && groupRows.length < pixelRows) {
        this.groups.push({ name, rows: groupRows });
      }
    }
  }

  // ---- what is taken ---------------------------------------------------------

  private updateSelection(force: boolean) {
    const rows = this.rows || [];
    let signature = '';

    this.selected.clear();

    for (const row of rows) {
      const selected = this.isSelected(row);

      if (selected) {
        this.selected.add(row);
      }

      signature += selected ? '1' : '0';
    }

    if (force || signature !== this.selectionSignature) {
      this.selectionSignature = signature;
      this.draw();
    }
  }

  rowIsSelected(row: PresetFixture): boolean {
    return this.selected.has(row);
  }

  // all of the pixels of a group are taken, or some of them
  groupState(group: PixelGridGroup): 'all' | 'some' | 'none' {
    const count = group.rows.filter((row) => this.selected.has(row)).length;

    return count === 0 ? 'none' : count === group.rows.length ? 'all' : 'some';
  }

  // a group takes all of its pixels, or releases them once it has all of them
  selectGroup(group: PixelGridGroup) {
    this.select(group.rows, this.groupState(group) !== 'all');
  }

  selectRow(row: PresetFixture) {
    this.select([row], !this.selected.has(row));
  }

  private select(rows: PresetFixture[], selected: boolean) {
    this.selectRows.emit({ rows, selected });
    this.updateSelection(false);
  }

  // ---- the grid --------------------------------------------------------------

  private draw() {
    const canvas = this.gridRef?.nativeElement;

    if (!canvas || this.columns === 0) {
      return;
    }

    // as wide as the panel lets it, but no wider than a few pixels each
    this.drawnWidth = this.elementRef.nativeElement.clientWidth;

    const width = Math.max(this.drawnWidth, 0) || this.columns * MAX_PITCH;
    const pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.floor(width / this.columns)));
    const gap = pitch >= 8 ? 2 : 1;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = this.columns * pitch;
    const cssHeight = this.gridRows * pitch;

    this.pitch = pitch;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    for (const cell of this.cells) {
      context.fillStyle = this.cellColor(cell);
      context.fillRect(cell.column * pitch, cell.row * pitch, pitch - gap, pitch - gap);
    }
  }

  private cellColor(cell: PixelGridCell): string {
    if (!cell.presetFixture) {
      return WITHOUT_ROW_COLOR;
    }

    return this.cellIsSelected(cell) ? SELECTED_COLOR : UNSELECTED_COLOR;
  }

  // taken, or about to be taken by the drag going on
  cellIsSelected(cell: PixelGridCell): boolean {
    if (this.painting !== undefined && this.painted.has(cell.presetFixture)) {
      return this.painting;
    }

    return this.selected.has(cell.presetFixture);
  }

  private cellOf(event: { clientX: number; clientY: number }): PixelGridCell {
    const bounds = this.gridRef.nativeElement.getBoundingClientRect();
    const column = Math.floor((event.clientX - bounds.left) / this.pitch);
    const row = Math.floor((event.clientY - bounds.top) / this.pitch);

    return this.cellAt.get(column + ',' + row);
  }

  onPointerDown(event: PointerEvent) {
    const cell = this.cellOf(event);

    event.preventDefault();

    if (!cell?.presetFixture) {
      return;
    }

    // the first pixel decides: a drag from a taken one releases, from another one takes
    this.painting = !this.selected.has(cell.presetFixture);
    this.painted.clear();
    this.painted.add(cell.presetFixture);
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.draw();
  }

  onPointerMove(event: PointerEvent) {
    const cell = this.cellOf(event);

    this.hoveredKey = cell ? cell.key : '';

    if (this.painting === undefined || !cell?.presetFixture || this.painted.has(cell.presetFixture)) {
      return;
    }

    this.painted.add(cell.presetFixture);
    this.draw();
  }

  onPointerUp() {
    if (this.painting === undefined) {
      return;
    }

    const rows = [...this.painted];
    const selected = this.painting;

    this.painting = undefined;
    this.painted.clear();
    this.select(rows, selected);
    this.draw();
  }

  onPointerCancel() {
    this.painting = undefined;
    this.painted.clear();
    this.draw();
  }
}
