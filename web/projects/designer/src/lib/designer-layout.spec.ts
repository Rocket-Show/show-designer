import { DesignerLayout } from './designer-layout';
import { LayoutPanel, LayoutService } from './services/layout.service';

// The panels of the designer laid out with Split.js: the gutters carry the arrows which fold
// the panels next to them, or open the ones folded into them.
describe('DesignerLayout', () => {
  let root: HTMLElement;
  let layoutService: LayoutService;
  let layout: DesignerLayout;
  let resized: jasmine.Spy;
  let stored: string;

  const translateService: any = {
    instant: (key: string, parameters?: any) => (parameters ? key.split('.').pop() + ' ' + parameters.panels : key.split('.').pop()),
  };

  beforeEach(() => {
    stored = localStorage.getItem('designerLayout');
    localStorage.removeItem('designerLayout');

    root = document.createElement('div');
    root.innerHTML = `
      <div id="rows" style="display: flex; flex-direction: column; width: 900px; height: 600px">
        <div id="row1" style="display: flex"><div id="scenes"></div><div id="presets"></div><div id="preview"></div></div>
        <div id="row2" style="display: flex"><div id="capabilities"></div><div id="fixtures"></div><div id="masterDimmer"></div></div>
        <div id="row3"></div>
      </div>`;
    document.body.appendChild(root);

    layoutService = new LayoutService();
    layoutService.compact = false;
    resized = jasmine.createSpy('resized');
    layout = new DesignerLayout(root, layoutService, translateService, 6, resized);
  });

  afterEach(() => {
    root.remove();
    if (stored === null) {
      localStorage.removeItem('designerLayout');
    } else {
      localStorage.setItem('designerLayout', stored);
    }
  });

  function element(selector: string): HTMLElement {
    return root.querySelector(selector);
  }

  // the arrows of the gutters and the edges of an element, as "direction: title"
  function arrows(parent: HTMLElement, selector: string): string[][] {
    return Array.from(parent.children)
      .filter((child) => child.matches(selector))
      .map((child) =>
        Array.from(child.querySelectorAll('i')).map((icon) => icon.className.replace('fa fa-angle-', '') + ': ' + icon.title)
      );
  }

  function build(...folded: LayoutPanel[]) {
    layoutService.folded = folded;
    layout.build();
  }

  it('splits all the panels, the gutters folding the ones next to them', () => {
    build();

    expect(arrows(element('#row1'), '.gutter')).toEqual([
      ['left: fold panel-scenes', 'right: fold panel-presets'],
      ['left: fold panel-presets', 'right: fold panel-preview'],
    ]);
    expect(arrows(element('#row2'), '.gutter').length).toBe(2);
    expect(arrows(element('#rows'), '.gutter')).toEqual([
      ['up: fold panel-scenes, panel-presets, panel-preview', 'down: fold panel-editor, panel-fixtures, panel-master'],
      ['up: fold panel-editor, panel-fixtures, panel-master', 'down: fold panel-timeline'],
    ]);
    expect(root.querySelectorAll('.fold-edge').length).toBe(0);
    expect(resized).toHaveBeenCalled();
  });

  it('opens a panel folded between two others from the gutter between them', () => {
    build('presets');

    expect(element('#presets').classList).toContain('fold-hidden');
    expect(arrows(element('#row1'), '.gutter')).toEqual([['right: open panel-presets']]);
  });

  it('opens the panels folded at the edges of a row from a strip there', () => {
    build('scenes', 'master');

    expect(arrows(element('#row1'), '.fold-edge')).toEqual([['right: open panel-scenes']]);
    expect(element('#row1').firstElementChild.classList).toContain('fold-edge');
    expect(arrows(element('#row2'), '.fold-edge')).toEqual([['left: open panel-master']]);
    expect(element('#row2').lastElementChild.classList).toContain('fold-edge');
  });

  it('lets a single open panel fill its row', () => {
    build('scenes', 'presets');

    expect(element('#preview').style.flexBasis).toBe('100%');
    expect(arrows(element('#row1'), '.gutter')).toEqual([]);
  });

  it('folds a whole row away', () => {
    build('scenes', 'presets', 'preview');

    expect(element('#row1').classList).toContain('fold-hidden');
    expect(arrows(element('#rows'), '.fold-edge')).toEqual([['down: open panel-scenes, panel-presets, panel-preview']]);
    expect(arrows(element('#rows'), '.gutter').length).toBe(1);
  });

  it('folds the timeline down to its toolbar, opened from the strip above it', () => {
    build('timeline');

    expect(element('#row3').classList).toContain('fold-toolbar');
    expect(arrows(element('#rows'), '.gutter').length).toBe(1);
    expect(arrows(element('#rows'), '.fold-edge')).toEqual([['up: open panel-timeline']]);
    expect(element('#row3').previousElementSibling.classList).toContain('fold-edge');
  });

  it('marks the tab rail of the preset editor folded with it', () => {
    build('editor');

    expect(element('#row2').classList).toContain('fold-editor');
  });

  it('folds and opens the panels with the arrows', () => {
    build('presets');
    const fold = spyOn(layoutService, 'fold');
    const open = spyOn(layoutService, 'open');

    (element('#row1').querySelector('.gutter i') as HTMLElement).click();
    expect(open).toHaveBeenCalledWith(['presets']);

    (element('#row2').querySelector('.gutter i') as HTMLElement).click();
    expect(fold).toHaveBeenCalledWith(['editor']);
  });

  it('keeps a click on an arrow from dragging its gutter', () => {
    build();
    const arrow = element('#row1').querySelector('.gutter i');
    const dragged = jasmine.createSpy('dragged');
    element('#row1').querySelector('.gutter').addEventListener('mousedown', dragged);

    arrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    arrow.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));

    expect(dragged).not.toHaveBeenCalled();
  });

  it('builds the layout anew, without what was there before', () => {
    build('scenes');
    build('scenes');

    expect(root.querySelectorAll('.fold-edge').length).toBe(1);
    expect(arrows(element('#row1'), '.gutter').length).toBe(1);

    build();
    expect(root.querySelectorAll('.fold-edge').length).toBe(0);
    expect(element('#scenes').classList).not.toContain('fold-hidden');
  });

  it('splits nothing on a phone, where the open panels are stacked without the 3D preview', () => {
    build();
    layoutService.compact = true;
    resized.calls.reset();
    build('presets');

    expect(root.querySelectorAll('.gutter').length).toBe(0);
    expect(root.querySelectorAll('.fold-edge').length).toBe(0);
    expect(element('#scenes').style.flexBasis).toBe('');
    expect(element('#row1').style.flexBasis).toBe('');
    expect(element('#scenes').classList).not.toContain('fold-hidden');
    expect(element('#presets').classList).toContain('fold-hidden');
    expect(element('#preview').classList).toContain('fold-hidden');
    expect(resized).toHaveBeenCalled();

    // a row of which only the 3D preview is open is left out as a whole
    build('scenes', 'presets');
    expect(element('#row1').classList).toContain('fold-hidden');
    expect(element('#row2').classList).not.toContain('fold-hidden');

    // turned around to a larger screen
    layoutService.compact = false;
    build('scenes', 'presets');
    expect(element('#row1').classList).not.toContain('fold-hidden');
    expect(element('#preview').classList).not.toContain('fold-hidden');
    expect(arrows(element('#rows'), '.gutter').length).toBe(2);
  });

  it('keeps the sizes the panels are dragged to', () => {
    build();
    const keep = spyOn(layoutService, 'resized');
    const gutter = element('#row1').querySelector('.gutter');

    gutter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 350 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 350 }));

    expect(keep).toHaveBeenCalled();
    expect(keep.calls.mostRecent().args[0]).toEqual(['scenes', 'presets', 'preview']);
  });
});
