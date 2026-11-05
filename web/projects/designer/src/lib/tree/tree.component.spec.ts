import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreeDragService } from './tree-drag.service';
import { TreeComponent, TreeDropZone, TreeNode } from './tree.component';

// The folder trees of the presets, the scenes and the fixtures: the host builds its nodes
// again whenever what they show changes, and the tree keeps its rows and the selection.
describe('TreeComponent', () => {
  let fixture: ComponentFixture<TreeComponent>;
  let element: HTMLElement;

  // the same two rows, as new objects: this is what a host hands over after it has
  // built its nodes again
  const nodes = (): TreeNode[] => [
    { id: 'first', name: 'First' },
    { id: 'second', name: 'Second' },
  ];

  const rows = (): HTMLElement[] => Array.from(element.querySelectorAll('.tree-node'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TreeComponent],
    });

    fixture = TestBed.createComponent(TreeComponent);
    element = fixture.nativeElement;

    fixture.componentRef.setInput('nodes', nodes());
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(fixture.componentInstance).toBeTruthy();
    expect(rows().length).toBe(2);
  });

  it('keeps the rows it has, when the nodes are built again', () => {
    const before = rows();

    fixture.componentRef.setInput('nodes', nodes());
    fixture.detectChanges();

    const after = rows();

    expect(after.length).toBe(2);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('keeps the selection on the rows, when the nodes are built again', () => {
    const selected = fixture.componentInstance.nodes[1];

    fixture.componentRef.setInput('selectedNodes', [selected]);
    fixture.detectChanges();

    expect(rows()[1].classList).toContain('selected');

    fixture.componentRef.setInput('nodes', nodes());
    fixture.detectChanges();

    expect(rows()[1].classList).toContain('selected');
  });

  it('replaces the rows of nodes which are gone', () => {
    fixture.componentRef.setInput('nodes', [{ id: 'third', name: 'Third' }]);
    fixture.detectChanges();

    expect(rows().length).toBe(1);
    expect(rows()[0].textContent.trim()).toBe('Third');
  });
});

// The tree with folders: opening and closing them, selecting rows the way a file manager
// does, and moving the selection around by drag and drop.
describe('TreeComponent with folders', () => {
  let fixture: ComponentFixture<TreeComponent>;
  let tree: TreeComponent;
  let element: HTMLElement;
  let treeDragService: TreeDragService;

  // A (open): a1, a2 / B (closed): b1 / c
  let a: TreeNode;
  let a1: TreeNode;
  let a2: TreeNode;
  let b: TreeNode;
  let b1: TreeNode;
  let c: TreeNode;

  let selected: TreeNode[][];
  let activated: TreeNode[];
  let changed: TreeNode[][];
  let expanded: TreeNode[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TreeComponent],
    });

    a1 = { id: 'a1', name: 'a1' };
    a2 = { id: 'a2', name: 'a2' };
    a = { id: 'A', name: 'A', isFolder: true, expanded: true, children: [a1, a2] };
    b1 = { id: 'b1', name: 'b1' };
    b = { id: 'B', name: 'B', isFolder: true, expanded: false, children: [b1] };
    c = { id: 'c', name: 'c' };

    treeDragService = TestBed.inject(TreeDragService);

    fixture = TestBed.createComponent(TreeComponent);
    tree = fixture.componentInstance;
    element = fixture.nativeElement;

    selected = [];
    activated = [];
    changed = [];
    expanded = [];
    tree.selectedNodesChange.subscribe((nodes) => selected.push(nodes));
    tree.activate.subscribe((node) => activated.push(node));
    tree.nodesChange.subscribe((nodes) => changed.push(nodes));
    tree.nodeExpandedChange.subscribe((node) => expanded.push(node));

    fixture.componentRef.setInput('nodes', [a, b, c]);
    fixture.detectChanges();
  });

  const rows = (): HTMLElement[] => Array.from(element.querySelectorAll('.tree-node'));
  const names = (): string[] => rows().map((row) => row.textContent.trim());
  const row = (name: string): HTMLElement => rows().find((candidate) => candidate.textContent.trim() === name);
  const tail = (): HTMLElement => element.querySelector('.tree-tail');
  const ids = (list: TreeNode[]): string[] => list.map((node) => node.id as string);

  function click(name: string, init: MouseEventInit = {}) {
    row(name).dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
    fixture.detectChanges();
  }

  // what the browser hands a drag over: a DataTransfer made by a page cannot be written
  // to outside of a real drag, so the effects are kept on a plain object
  function dataTransfer(): DataTransfer {
    const data: { [type: string]: string } = {};

    return {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (type: string, value: string) => (data[type] = value),
      getData: (type: string) => data[type],
    } as any;
  }

  // a drag event on a row: `at` is how far down the row the cursor is (0 = top edge, 1 =
  // bottom edge), `level` the tree level the cursor points at horizontally
  function drag(type: string, target: HTMLElement, at = 0.5, level = 0): DragEvent {
    const rect = target.getBoundingClientRect();
    const event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 4 + level * 15,
      clientY: rect.top + rect.height * at,
    });

    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer() });
    target.dispatchEvent(event);
    fixture.detectChanges();

    return event;
  }

  // drag the passed row to a position on another one and drop it there
  function dragAndDrop(from: string, to: string, at: number, level = 0) {
    drag('dragstart', row(from));
    drag('dragover', row(to), at, level);
    drag('drop', row(to), at, level);
  }

  function indicator(): { row: string; zone: TreeDropZone; indent: string } {
    for (const candidate of rows()) {
      for (const zone of ['before', 'after', 'inside'] as TreeDropZone[]) {
        if (candidate.classList.contains('drop-' + zone)) {
          return { row: candidate.textContent.trim(), zone, indent: candidate.style.getPropertyValue('--tree-drop-indent') };
        }
      }
    }

    return undefined;
  }

  describe('folders', () => {
    it('shows the content of the open folders only, indented by their level', () => {
      expect(names()).toEqual(['A', 'a1', 'a2', 'B', 'c']);
      expect(row('A').style.getPropertyValue('--tree-indent')).toBe('4px');
      expect(row('a1').style.getPropertyValue('--tree-indent')).toBe('19px');
    });

    it('opens and closes a folder with its caret, without selecting it', () => {
      const caret = row('B').querySelector('.tree-caret');

      expect(caret.classList).toContain('fa-caret-right');

      caret.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(names()).toEqual(['A', 'a1', 'a2', 'B', 'b1', 'c']);
      expect(b.expanded).toBe(true);
      expect(expanded).toEqual([b]);
      expect(row('B').querySelector('.tree-caret').classList).toContain('fa-caret-down');
      expect(selected).toEqual([]);
      expect(activated).toEqual([]);
    });

    it('opens and closes a folder whose icon shows it with a plain click on its row, and selects it', () => {
      a.toggleOnClick = true;
      fixture.componentRef.setInput('nodes', [a, b, c]);
      fixture.detectChanges();

      // no caret glyph, but its slot is kept so the icons line up
      const caret = row('A').querySelector('.tree-caret');
      expect(caret.classList).not.toContain('fa-caret-down');
      expect(caret.classList).not.toContain('fa-caret-right');

      click('A');

      expect(names()).toEqual(['A', 'B', 'c']);
      expect(expanded).toEqual([a]);
      expect(activated).toEqual([a]);
      expect(ids(selected[0])).toEqual(['A']);

      // the empty slot of the caret does nothing
      caret.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(a.expanded).toBe(true);
    });

    it('picks the type icon of a row from what the host says it is', () => {
      const tree = fixture.componentInstance;

      expect(tree.nodeIcon({ isFolder: true, expanded: false })).toBe('fa fa-folder-o');
      expect(tree.nodeIcon({ isFolder: false })).toBe('fa fa-file-o');
      expect(tree.nodeIcon({ isFolder: true, expanded: true, icon: 'fa-folder-o', iconOpen: 'fa-folder-open-o' })).toBe(
        'fa fa-folder-open-o'
      );
      expect(tree.nodeIcon({ isFolder: true, expanded: false, icon: 'fa-folder-o', iconOpen: 'fa-folder-open-o' })).toBe('fa fa-folder-o');
      expect(tree.nodeIcon({ iconClass: 'icon-moving-head' })).toBe('icon-moving-head');

      c.icon = 'fa-film';
      c.iconColor = 'rgb(255, 0, 0)';
      fixture.componentRef.setInput('nodes', [a, b, c]);
      fixture.detectChanges();

      const icon: HTMLElement = row('c').querySelector('.tree-icon');
      expect(icon.classList).toContain('fa-film');
      expect(icon.style.color).toBe('rgb(255, 0, 0)');
    });

    it('marks the rows the host asks for and the one it focuses', () => {
      fixture.componentRef.setInput('nodeClass', (node: TreeNode) => (node === a1 ? 'inactive-list-item' : ''));
      fixture.componentRef.setInput('focusedNode', c);
      fixture.detectChanges();

      expect(row('a1').classList).toContain('inactive-list-item');
      expect(row('a2').classList).not.toContain('inactive-list-item');
      expect(row('c').classList).toContain('focused');
      expect(row('a1').classList).not.toContain('focused');
    });
  });

  describe('selection', () => {
    it('selects the row a plain click went to, and activates it', () => {
      click('a1');
      click('c');

      expect(selected.map(ids)).toEqual([['a1'], ['c']]);
      expect(activated).toEqual([a1, c]);
      expect(row('c').classList).toContain('selected');
      expect(row('a1').classList).not.toContain('selected');
    });

    it('adds a row to the selection and takes it out again with ctrl or cmd', () => {
      click('a1');
      click('c', { ctrlKey: true });

      expect(ids(selected[1])).toEqual(['a1', 'c']);

      click('a1', { metaKey: true });

      expect(ids(selected[2])).toEqual(['c']);
      // only a plain click activates a row
      expect(activated).toEqual([a1]);
    });

    it('selects the visible rows between the last click and a shift click', () => {
      click('a2');
      click('c', { shiftKey: true });

      expect(ids(selected[1])).toEqual(['a2', 'B', 'c']);

      // upwards, and the rows of a closed folder are not part of it
      click('A', { shiftKey: true });

      expect(ids(selected[2])).toEqual(['A', 'a1', 'a2']);
    });

    it('adds the range to the selection with shift and ctrl together', () => {
      click('A');
      click('B', { ctrlKey: true });
      click('c', { shiftKey: true, ctrlKey: true });

      expect(ids(selected[2])).toEqual(['A', 'B', 'c']);
    });

    it('selects a single row with shift, when nothing was clicked before', () => {
      click('a2', { shiftKey: true });

      expect(ids(selected[0])).toEqual(['a2']);
    });

    it('only activates a row on a plain click, where a click means something else', () => {
      fixture.componentRef.setInput('plainClickSelects', false);
      fixture.detectChanges();

      click('a1');

      expect(activated).toEqual([a1]);
      expect(selected).toEqual([]);
      expect(row('a1').classList).not.toContain('selected');

      // ctrl still selects, so several rows can be dragged together
      click('a2', { ctrlKey: true });

      expect(ids(selected[0])).toEqual(['a2']);
    });

    it('opens what a row stands for on a double click', () => {
      const opened: TreeNode[] = [];
      tree.nodeDoubleClick.subscribe((node) => opened.push(node));

      row('a2').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(opened).toEqual([a2]);
    });
  });

  describe('drag and drop', () => {
    it('drops a row before the one at the top of which it is dropped', () => {
      dragAndDrop('c', 'a1', 0.1);

      expect(ids(a.children)).toEqual(['c', 'a1', 'a2']);
      expect(ids(tree.nodes)).toEqual(['A', 'B']);
      expect(changed).toEqual([tree.nodes]);
      expect(names()).toEqual(['A', 'c', 'a1', 'a2', 'B']);
    });

    it('drops a row after the one at the bottom of which it is dropped', () => {
      dragAndDrop('c', 'a1', 0.9, 1);

      expect(ids(a.children)).toEqual(['a1', 'c', 'a2']);
    });

    it('shows where the row goes while it is dragged over the others', () => {
      const start = drag('dragstart', row('c'));

      expect(start.dataTransfer.effectAllowed).toBe('move');
      expect(start.dataTransfer.getData('text/plain')).toBe('c');
      expect(row('c').classList).toContain('dragging');

      const over = drag('dragover', row('a1'), 0.1);

      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer.dropEffect).toBe('move');
      expect(indicator()).toEqual({ row: 'a1', zone: 'before', indent: '19px' });

      drag('dragover', row('B'), 0.5);

      expect(indicator()).toEqual({ row: 'B', zone: 'inside', indent: '4px' });

      // ends without a drop
      element.querySelector('.tree').dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      fixture.detectChanges();

      expect(indicator()).toBeUndefined();
      expect(row('c').classList).not.toContain('dragging');
      expect(changed).toEqual([]);
    });

    it('drops a row into a folder, which opens to show it', () => {
      dragAndDrop('c', 'B', 0.5);

      expect(ids(b.children)).toEqual(['b1', 'c']);
      expect(b.expanded).toBe(true);
      expect(expanded).toEqual([b]);
      expect(names()).toEqual(['A', 'a1', 'a2', 'B', 'b1', 'c']);
    });

    it('turns a node without children into a folder, when one is dropped into it', () => {
      const empty: TreeNode = { id: 'empty', name: 'empty', isFolder: true, expanded: true };
      fixture.componentRef.setInput('nodes', [empty, c]);
      fixture.detectChanges();

      dragAndDrop('c', 'empty', 0.5);

      expect(ids(empty.children)).toEqual(['c']);
      // it was open already
      expect(expanded).toEqual([]);
    });

    it('drops before a folder at its top and after a closed one at its bottom', () => {
      dragAndDrop('a1', 'B', 0.1);

      expect(ids(tree.nodes)).toEqual(['A', 'a1', 'B', 'c']);

      dragAndDrop('a2', 'B', 0.9);

      expect(ids(tree.nodes)).toEqual(['A', 'a1', 'B', 'a2', 'c']);
      expect(a.children).toEqual([]);
    });

    it('drops into an open folder at the bottom of its row, its end is below its last child', () => {
      dragAndDrop('c', 'A', 0.9);

      expect(ids(a.children)).toEqual(['a1', 'a2', 'c']);
    });

    it('drops after the last child of a folder, or after the folder itself, by how far left the cursor is', () => {
      drag('dragstart', row('c'));
      drag('dragover', row('a2'), 0.9, 1);

      expect(indicator()).toEqual({ row: 'a2', zone: 'after', indent: '19px' });

      drag('dragover', row('a2'), 0.9, 0);

      // drawn at the bottom of the folder's content, at the folder's own level
      expect(indicator()).toEqual({ row: 'a2', zone: 'after', indent: '4px' });

      drag('drop', row('a2'), 0.9, 0);

      expect(ids(tree.nodes)).toEqual(['A', 'c', 'B']);
      expect(ids(a.children)).toEqual(['a1', 'a2']);
    });

    it('moves the whole selection together', () => {
      click('a1');
      click('c', { ctrlKey: true });

      dragAndDrop('c', 'B', 0.1);

      expect(ids(tree.nodes)).toEqual(['A', 'a1', 'c', 'B']);
      expect(ids(a.children)).toEqual(['a2']);
    });

    it('makes a row which is dragged without being selected the only selection', () => {
      click('a1');
      selected = [];

      drag('dragstart', row('c'));

      expect(selected.map(ids)).toEqual([['c']]);
      expect(row('c').classList).toContain('dragging');
      expect(row('a1').classList).not.toContain('dragging');
    });

    it('never drags a row together with the folder it is in', () => {
      click('A');
      click('a1', { ctrlKey: true });

      // the folder takes its content along
      drag('dragstart', row('A'));

      expect(row('A').classList).toContain('dragging');
      expect(row('a1').classList).not.toContain('dragging');

      element.querySelector('.tree').dispatchEvent(new DragEvent('dragend', { bubbles: true }));

      // grabbing the child drags only the child
      drag('dragstart', row('a1'));

      expect(row('a1').classList).toContain('dragging');
      expect(row('A').classList).not.toContain('dragging');
    });

    it('does not drop a folder into itself or its own content', () => {
      drag('dragstart', row('A'));

      expect(drag('dragover', row('a1'), 0.1).defaultPrevented).toBe(false);
      expect(drag('dragover', row('A'), 0.5).defaultPrevented).toBe(false);
      expect(indicator()).toBeUndefined();

      drag('drop', row('a1'), 0.1);

      expect(changed).toEqual([]);
      expect(ids(tree.nodes)).toEqual(['A', 'B', 'c']);

      // anywhere else it may go
      dragAndDrop('A', 'c', 0.9);

      expect(ids(tree.nodes)).toEqual(['B', 'c', 'A']);
    });

    it('does not drag what the host does not allow to be dragged', () => {
      fixture.componentRef.setInput('allowDrag', (node: TreeNode) => node !== c);
      fixture.detectChanges();

      expect(row('c').getAttribute('draggable')).toBe('false');
      expect(row('a1').getAttribute('draggable')).toBe('true');

      expect(drag('dragstart', row('c')).defaultPrevented).toBe(true);
      expect(row('c').classList).not.toContain('dragging');

      // nothing is dragged, so nothing can be dropped
      expect(drag('dragover', row('a1'), 0.1).defaultPrevented).toBe(false);
    });

    it('asks the host where the dragged rows may go, and falls back to what it allows', () => {
      const asked: [string[], string, TreeDropZone][] = [];

      // the rows of this tree may only go into a folder (a preset into a scene)
      fixture.componentRef.setInput('allowDrop', (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone) => {
        asked.push([ids(dragged), target.id as string, zone]);
        return zone === 'inside';
      });
      fixture.detectChanges();

      drag('dragstart', row('c'));

      // the top of a folder is "before" it, but the folder takes the row in instead
      drag('dragover', row('B'), 0.1);
      expect(indicator()).toEqual({ row: 'B', zone: 'inside', indent: '4px' });
      expect(asked).toEqual([
        [['c'], 'B', 'before'],
        [['c'], 'B', 'inside'],
      ]);

      // next to the last child of a folder, outdented to the folder: into it
      drag('dragover', row('a2'), 0.9, 0);
      expect(indicator()).toEqual({ row: 'A', zone: 'inside', indent: '4px' });

      // next to a row which is no folder there is no place for it
      expect(drag('dragover', row('a1'), 0.1).defaultPrevented).toBe(false);
      expect(indicator()).toBeUndefined();

      drag('dragover', row('a2'), 0.9, 0);
      drag('drop', row('a2'), 0.9, 0);

      expect(ids(a.children)).toEqual(['a1', 'a2', 'c']);
    });

    it('falls back to a place beside a folder, which does not take the rows in', () => {
      // scenes cannot go into another scene, only between them
      fixture.componentRef.setInput('allowDrop', (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone) => zone !== 'inside');
      fixture.detectChanges();

      drag('dragstart', row('c'));

      drag('dragover', row('B'), 0.5);
      expect(indicator()).toEqual({ row: 'B', zone: 'after', indent: '4px' });

      drag('dragover', row('B'), 0.4);
      expect(indicator()).toEqual({ row: 'B', zone: 'before', indent: '4px' });

      drag('dragover', row('B'), 0.9);
      expect(indicator()).toEqual({ row: 'B', zone: 'after', indent: '4px' });
    });

    it('drops at the very end of the tree below the last row', () => {
      drag('dragstart', row('a1'));

      const over = drag('dragover', tail());

      expect(over.defaultPrevented).toBe(true);
      expect(tail().classList).toContain('drop-tail');
      expect(indicator()).toBeUndefined();

      drag('drop', tail());

      expect(ids(tree.nodes)).toEqual(['A', 'B', 'c', 'a1']);
      expect(ids(a.children)).toEqual(['a2']);
      expect(changed).toEqual([tree.nodes]);
      expect(tail().classList).not.toContain('drop-tail');
    });

    it('does not drop below the last row, when nothing may go after it', () => {
      fixture.componentRef.setInput('allowDrop', (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone) => target !== c);
      fixture.detectChanges();

      drag('dragstart', row('a1'));

      expect(drag('dragover', tail()).defaultPrevented).toBe(false);
      expect(tail().classList).not.toContain('drop-tail');

      drag('drop', tail());

      expect(changed).toEqual([]);
      expect(ids(a.children)).toEqual(['a1', 'a2']);
    });

    it('does nothing on a drop without a drag', () => {
      drag('drop', row('a1'));
      drag('drop', tail());
      drag('dragover', tail());

      expect(changed).toEqual([]);
      expect(tail().classList).not.toContain('drop-tail');
    });

    it('takes the rows in which another tree offers, as a copy', () => {
      fixture.componentRef.setInput('acceptExternalDrag', true);
      fixture.detectChanges();

      const offered: TreeNode = { id: 'x', name: 'x' };
      treeDragService.start([offered]);

      const over = drag('dragover', row('a1'), 0.1);

      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer.dropEffect).toBe('copy');
      expect(indicator()).toEqual({ row: 'a1', zone: 'before', indent: '19px' });

      drag('drop', row('a1'), 0.1);

      expect(ids(a.children)).toEqual(['x', 'a1', 'a2']);
      expect(a.children[0]).not.toBe(offered);
      expect(treeDragService.nodes).toEqual([]);
    });

    it('takes the rows another tree offers at its very end, as a copy', () => {
      fixture.componentRef.setInput('acceptExternalDrag', true);
      fixture.detectChanges();

      const offered: TreeNode = { id: 'x', name: 'x' };
      treeDragService.start([offered]);

      expect(drag('dragover', tail()).dataTransfer.dropEffect).toBe('copy');

      drag('drop', tail());

      expect(ids(tree.nodes)).toEqual(['A', 'B', 'c', 'x']);
      expect(tree.nodes[3]).not.toBe(offered);
    });

    it('ignores the rows another tree offers, unless it takes them', () => {
      treeDragService.start([{ id: 'x', name: 'x' }]);

      expect(drag('dragover', row('a1'), 0.1).defaultPrevented).toBe(false);
      expect(drag('dragover', tail()).defaultPrevented).toBe(false);

      drag('drop', row('a1'), 0.1);

      expect(changed).toEqual([]);
    });

    it('clears the indicator when a drag from another tree ends there', () => {
      fixture.componentRef.setInput('acceptExternalDrag', true);
      fixture.detectChanges();
      treeDragService.start([{ id: 'x', name: 'x' }]);

      drag('dragover', row('a1'), 0.1);
      expect(indicator()).toBeDefined();

      treeDragService.end();
      fixture.detectChanges();

      expect(indicator()).toBeUndefined();
      expect(treeDragService.nodes).toEqual([]);
    });

    it('keeps the indicator of its own drag when a drag of another tree ends', () => {
      drag('dragstart', row('c'));
      drag('dragover', row('a1'), 0.1);

      treeDragService.end();
      fixture.detectChanges();

      expect(indicator()).toEqual({ row: 'a1', zone: 'before', indent: '19px' });
    });

    it('offers its drag to the other trees, which insert a copy, while it keeps its own rows', () => {
      fixture.componentRef.setInput('publishDrag', true);
      fixture.detectChanges();

      const start = drag('dragstart', row('c'));

      expect(start.dataTransfer.effectAllowed).toBe('copyMove');
      expect(treeDragService.nodes).toEqual([c]);

      element.querySelector('.tree').dispatchEvent(new DragEvent('dragend', { bubbles: true }));

      expect(treeDragService.nodes).toEqual([]);
    });

    it('stops listening to the drags of other trees once it is gone', () => {
      fixture.destroy();

      expect(treeDragService.ended.observers.length).toBe(0);
    });
  });
});

// A host fills the rows of a tree with its own template, e.g. a name to edit in place.
describe('TreeComponent with a template of the host', () => {
  @Component({
    template: `
      <lib-tree [nodes]="nodes">
        <ng-template #nodeTemplate let-node
          ><b class="custom">{{ node.name }}!</b></ng-template
        >
      </lib-tree>
    `,
    standalone: false,
  })
  class HostComponent {
    nodes: TreeNode[] = [{ id: 'one', name: 'One' }];
  }

  it('shows the rows with the template of the host', () => {
    TestBed.configureTestingModule({
      declarations: [TreeComponent, HostComponent],
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tree-node .custom').textContent).toBe('One!');
  });
});

// Carries the rows dragged out of one tree into another one.
describe('TreeDragService', () => {
  it('holds the dragged rows until the drag ends, and says when it does', () => {
    const service = new TreeDragService();
    const node: TreeNode = { id: 'x' };
    let ended = 0;

    service.ended.subscribe(() => ended++);
    service.start([node]);

    expect(service.nodes).toEqual([node]);

    service.end();

    expect(service.nodes).toEqual([]);
    expect(ended).toBe(1);
  });
});
