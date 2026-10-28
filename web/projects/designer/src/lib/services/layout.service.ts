import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type LayoutPanel = 'scenes' | 'presets' | 'preview' | 'editor' | 'fixtures' | 'master' | 'timeline';
export type LayoutName = 'default' | 'presets' | 'show' | 'stage';

interface Layout {
  folded: LayoutPanel[];
  shares: { [key: string]: number };
}

// How the room is shared, when everything is open: the rows share the height, the panels of
// a row its width. Only the ratios between the open ones count.
const defaultShares: { [key: string]: number } = {
  'row-0': 42,
  'row-1': 40,
  'row-2': 18,
  scenes: 20,
  presets: 20,
  preview: 60,
  editor: 70,
  fixtures: 24,
  master: 6,
};

// the layouts picked in the View menu, each for a way of working on the show
const layouts: { [name in LayoutName]: Layout } = {
  // everything open
  default: { folded: [], shares: {} },
  // editing the presets: the timeline only shows its toolbar
  presets: { folded: ['timeline'], shares: { 'row-0': 42, 'row-1': 58 } },
  // putting the scenes on the timeline: the scene list stays, the presets fold away
  show: { folded: ['presets', 'editor', 'fixtures', 'master'], shares: { 'row-0': 35, 'row-2': 65, scenes: 25, preview: 75 } },
  // watching the show: a big 3D preview, played from the toolbar of the timeline
  stage: { folded: ['presets', 'editor', 'fixtures', 'master', 'timeline'], shares: { scenes: 20, preview: 80 } },
};

/**
 * Which panels of the designer are open and how much room they get. A panel is folded with
 * the arrows in the gutters next to it or in the View menu, and the timeline folds down to
 * its toolbar. The layout is a matter of the browser, not of the project: it is kept in the
 * local storage.
 */
@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  private static readonly storageKey = 'designerLayout';

  // the rows of the designer and the panels in them, from the top and from the left
  readonly rows: LayoutPanel[][] = [['scenes', 'presets', 'preview'], ['editor', 'fixtures', 'master'], ['timeline']];
  readonly panels: LayoutPanel[] = this.rows.reduce((all, row) => all.concat(row), []);
  readonly layouts: LayoutName[] = ['default', 'presets', 'show', 'stage'];

  // what the panels are marked with in the View menu
  readonly icons: { [panel in LayoutPanel]: string } = {
    scenes: 'fa fa-film',
    presets: 'fa fa-lightbulb-o',
    preview: 'fa fa-cube',
    editor: 'fa fa-sliders',
    fixtures: 'fa fa-th-large',
    master: 'icon-dimmer',
    timeline: 'fa fa-align-left',
  };

  folded: LayoutPanel[] = [];
  shares: { [key: string]: number } = { ...defaultShares };

  // the layout picked last, as long as nothing has been changed by hand since
  layout: LayoutName = 'default';

  // the panels have been folded, opened or resized
  changed: Subject<void> = new Subject<void>();

  constructor() {
    this.restore();
  }

  isFolded(panel: LayoutPanel): boolean {
    return this.folded.indexOf(panel) >= 0;
  }

  // all panels of the row are folded away (the timeline: down to its toolbar)
  isRowFolded(row: number): boolean {
    return this.rows[row].every((panel) => this.isFolded(panel));
  }

  fold(panels: LayoutPanel[]) {
    this.folded = this.folded.concat(panels.filter((panel) => !this.isFolded(panel)));
    this.changedByHand();
  }

  open(panels: LayoutPanel[]) {
    this.folded = this.folded.filter((panel) => panels.indexOf(panel) < 0);
    this.changedByHand();
  }

  toggle(panel: LayoutPanel) {
    if (this.isFolded(panel)) {
      this.open([panel]);
    } else {
      this.fold([panel]);
    }
  }

  applyLayout(name: LayoutName) {
    const layout = layouts[name];

    this.folded = layout.folded.slice();
    this.shares = { ...defaultShares, ...layout.shares };
    this.layout = name;
    this.store();
    this.changed.next();
  }

  // The open panels of a row (or the open rows) have been resized to the passed percentages
  // of the room they share. The folded ones keep their share for when they are opened again.
  resized(keys: string[], percentages: number[]) {
    const total = keys.reduce((sum, key) => sum + this.shares[key], 0);

    keys.forEach((key, index) => (this.shares[key] = (percentages[index] / 100) * total));
    this.layout = undefined;
    this.store();
  }

  // the percentages of the room the passed (open) panels or rows get
  getSizes(keys: string[]): number[] {
    const total = keys.reduce((sum, key) => sum + this.shares[key], 0);

    return keys.map((key) => (this.shares[key] / total) * 100);
  }

  private changedByHand() {
    this.layout = undefined;
    this.store();
    this.changed.next();
  }

  private store() {
    try {
      localStorage.setItem(LayoutService.storageKey, JSON.stringify({ folded: this.folded, shares: this.shares, layout: this.layout }));
    } catch (error) {
      // the layout is only kept for this session, e.g. in a private window
    }
  }

  private restore() {
    let stored: any;

    try {
      stored = JSON.parse(localStorage.getItem(LayoutService.storageKey));
    } catch (error) {
      return;
    }

    if (!stored) {
      return;
    }

    if (Array.isArray(stored.folded)) {
      this.folded = stored.folded.filter((panel: LayoutPanel) => this.panels.indexOf(panel) >= 0);
    }

    if (stored.shares) {
      for (const key of Object.keys(defaultShares)) {
        if (stored.shares[key] > 0) {
          this.shares[key] = stored.shares[key];
        }
      }
    }

    this.layout = this.layouts.indexOf(stored.layout) >= 0 ? stored.layout : undefined;
  }
}
