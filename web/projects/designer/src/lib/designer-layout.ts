import { TranslateService } from '@ngx-translate/core';
import Split from 'split.js';
import { getFoldSpots } from './models/layout-fold';
import { LayoutPanel, LayoutService } from './services/layout.service';

// something which is folded and opened as a whole: a panel of a row, or a row
interface LayoutItem {
  // its share of the room (see LayoutService.shares)
  key: string;
  element: HTMLElement;
  panels: LayoutPanel[];
  open: boolean;
}

interface FoldArrow {
  direction: 'left' | 'right' | 'up' | 'down';
  title: string;
  action: () => void;
}

/**
 * Lays the panels of the designer out with Split.js: the rows from top to bottom, the panels
 * of a row from left to right. Only the open panels are split, a folded one drops out of the
 * layout. The gutters carry the arrows to fold the panels next to them, or to open the ones
 * folded into them. A panel folded at the edge of a row leaves a thin strip with its arrow.
 * The timeline folds down to its toolbar, which stays below the rows. On a phone, nothing is
 * split: the open panels are stacked, without the 3D preview.
 */
export class DesignerLayout {
  private splits: Split.Instance[] = [];

  constructor(
    private root: HTMLElement,
    private layoutService: LayoutService,
    private translateService: TranslateService,
    private gutterSizePx: number,
    private resized: () => void
  ) {}

  private element(selector: string): HTMLElement {
    return this.root.querySelector(selector);
  }

  build() {
    this.splits.forEach((split) => split.destroy());
    this.splits = [];
    this.root.querySelectorAll('.fold-edge').forEach((edge) => edge.remove());

    const layout = this.layoutService;
    const rows = ['#row1', '#row2', '#row3'].map((selector) => this.element(selector));
    const panels: { [panel: string]: HTMLElement } = {
      scenes: this.element('#scenes'),
      presets: this.element('#presets'),
      preview: this.element('#preview'),
      editor: this.element('#capabilities'),
      fixtures: this.element('#fixtures'),
      master: this.element('#masterDimmer'),
    };

    // a single open panel is not split: it fills its row, the size of a split before it is gone
    Object.keys(panels).forEach((panel) => (panels[panel].style.flexBasis = ''));
    rows.forEach((row) => (row.style.flexBasis = ''));

    // on a phone, the 3D preview is left out like a folded panel
    const hidden = (panel: LayoutPanel) => layout.isFolded(panel) || (layout.compact && panel === 'preview');

    Object.keys(panels).forEach((panel) => panels[panel].classList.toggle('fold-hidden', hidden(panel as LayoutPanel)));
    rows[0].classList.toggle('fold-hidden', layout.rows[0].every(hidden));
    rows[1].classList.toggle('fold-hidden', layout.rows[1].every(hidden));
    // the tab rail of the preset editor goes with it (it is only there once a project is loaded)
    rows[1].classList.toggle('fold-editor', layout.isFolded('editor'));

    const timelineFolded = layout.isFolded('timeline');
    rows[2].classList.toggle('fold-toolbar', timelineFolded);

    // a phone has no room to split: the open panels are stacked by the styles (.designer-compact)
    if (layout.compact) {
      this.resized();
      return;
    }

    // the panels of the open rows
    for (const row of [0, 1]) {
      if (!layout.isRowFolded(row)) {
        const items = layout.rows[row].map((panel) => ({
          key: panel,
          element: panels[panel],
          panels: [panel],
          open: !layout.isFolded(panel),
        }));
        this.buildGroup('horizontal', rows[row], items, row === 1 ? 50 : 100);
      }
    }

    // the rows. A folded timeline stays below them as its toolbar, the strip above it opens it.
    const rowItems: LayoutItem[] = [0, 1, 2]
      .filter((row) => row < 2 || !timelineFolded)
      .map((row) => ({ key: 'row-' + row, element: rows[row], panels: layout.rows[row], open: row === 2 || !layout.isRowFolded(row) }));
    const timelineArrow: FoldArrow = timelineFolded ? this.openArrow('up', layout.rows[2]) : undefined;

    this.buildGroup(
      'vertical',
      rows[0].parentElement,
      rowItems,
      100,
      timelineArrow ? { arrow: timelineArrow, before: rows[2] } : undefined
    );

    this.resized();
  }

  // split the open items of a row (or the rows) and put the arrows into the gutters between them
  private buildGroup(
    direction: 'horizontal' | 'vertical',
    container: HTMLElement,
    items: LayoutItem[],
    minSize: number,
    end?: { arrow: FoldArrow; before: HTMLElement }
  ) {
    const spots = getFoldSpots(items.map((item) => item.open));
    const open = items.filter((item) => item.open);
    const back = direction === 'horizontal' ? 'left' : 'up';
    const forth = direction === 'horizontal' ? 'right' : 'down';

    if (open.length > 1) {
      this.splits.push(
        Split(
          open.map((item) => item.element),
          {
            sizes: this.layoutService.getSizes(open.map((item) => item.key)),
            direction,
            cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
            snapOffset: 0,
            minSize,
            gutterSize: this.gutterSizePx,
            gutter: (index: number, gutterDirection: 'horizontal' | 'vertical') => {
              const spot = spots.gutters[index - 1];
              const gutter = document.createElement('div');
              gutter.className = 'gutter gutter-' + gutterDirection;
              gutter.appendChild(
                this.arrowElement(
                  spot.folded.length > 0
                    ? [this.openArrow(forth, this.panelsOf(items, spot.folded))]
                    : [this.foldArrow(back, items[spot.before].panels), this.foldArrow(forth, items[spot.after].panels)]
                )
              );
              return gutter;
            },
            elementStyle: (dimension, size, gutterSize) => ({ flexBasis: `calc(${size}% - ${gutterSize}px)` }),
            gutterStyle: (dimension, gutterSize) => ({ flexBasis: `${gutterSize}px` }),
            onDrag: () => this.resized(),
            onDragEnd: (sizes: number[]) =>
              this.layoutService.resized(
                open.map((item) => item.key),
                sizes
              ),
          }
        )
      );
    } else if (open.length === 1) {
      open[0].element.style.flexBasis = '100%';
    }

    if (spots.start.length > 0) {
      container.insertBefore(this.edge(direction, [this.openArrow(forth, this.panelsOf(items, spots.start))]), container.firstChild);
    }

    const endArrows =
      spots.end.length > 0 ? [this.openArrow(direction === 'horizontal' ? back : forth, this.panelsOf(items, spots.end))] : [];
    if (end) {
      endArrows.push(end.arrow);
    }
    if (endArrows.length > 0) {
      container.insertBefore(this.edge(direction, endArrows), end ? end.before : null);
    }
  }

  private panelsOf(items: LayoutItem[], indexes: number[]): LayoutPanel[] {
    return indexes.reduce((panels, index) => panels.concat(items[index].panels), []);
  }

  private names(panels: LayoutPanel[]): string {
    return panels.map((panel) => this.translateService.instant('designer.layout.panel-' + panel)).join(', ');
  }

  private foldArrow(direction: FoldArrow['direction'], panels: LayoutPanel[]): FoldArrow {
    return {
      direction,
      title: this.translateService.instant('designer.layout.fold', { panels: this.names(panels) }),
      action: () => this.layoutService.fold(panels),
    };
  }

  private openArrow(direction: FoldArrow['direction'], panels: LayoutPanel[]): FoldArrow {
    return {
      direction,
      title: this.translateService.instant('designer.layout.open', { panels: this.names(panels) }),
      action: () => this.layoutService.open(panels),
    };
  }

  // a strip at the edge of a row (or above the folded timeline), with the arrows to open what is folded there
  private edge(direction: 'horizontal' | 'vertical', arrows: FoldArrow[]): HTMLElement {
    const edge = document.createElement('div');
    edge.className = 'fold-edge fold-edge-' + direction;
    edge.appendChild(this.arrowElement(arrows));

    return edge;
  }

  private arrowElement(arrows: FoldArrow[]): HTMLElement {
    const box = document.createElement('span');
    box.className = 'fold-arrows';

    for (const arrow of arrows) {
      const icon = document.createElement('i');
      icon.className = 'fa fa-angle-' + arrow.direction;
      icon.title = arrow.title;
      icon.setAttribute('role', 'button');
      icon.setAttribute('aria-label', arrow.title);
      // a click on an arrow does not drag the gutter it is in
      icon.addEventListener('mousedown', (event) => event.stopPropagation());
      icon.addEventListener('touchstart', (event) => event.stopPropagation());
      icon.addEventListener('click', () => arrow.action());
      box.appendChild(icon);
    }

    return box;
  }
}
