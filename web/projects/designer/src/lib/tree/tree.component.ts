import { Component, ContentChild, EventEmitter, Input, OnChanges, Output, SimpleChanges, TemplateRef } from '@angular/core';

export interface TreeNode {
  id?: string | number;
  name?: string;
  isFolder?: boolean;
  expanded?: boolean;
  children?: TreeNode[];
  // allow arbitrary extra payload on a node
  [key: string]: any;
}

export type TreeDropZone = 'before' | 'after' | 'inside';

interface FlatNode {
  node: TreeNode;
  level: number;
  parent: TreeNode | null;
}

// A resolved drop: where the indicator is drawn vs. where the move is applied.
// They only differ when dropping "after a folder, from the outside" — the line
// is drawn at the bottom of the folder's last child (its visual end), but the
// node is inserted after the folder itself, at the folder's own level.
interface DropTarget {
  row: TreeNode; // the row the indicator line attaches to
  zone: TreeDropZone; // before / after / inside (line position or outline)
  indent: number; // px the indicator line is indented (= chosen drop level)
  ref: TreeNode; // node the dragged items are inserted relative to
}

/**
 * A lightweight, dependency-free tree:
 *  - collapsible folders (closed/open folder icon)
 *  - multi selection (ctrl/cmd to toggle, shift to select a range)
 *  - native HTML5 drag & drop, dropping before/after a node or into a folder,
 *    moving the whole current selection at once
 */
@Component({
  selector: 'lib-tree',
  templateUrl: './tree.component.html',
  styleUrls: ['./tree.component.css'],
  standalone: false,
})
export class TreeComponent implements OnChanges {
  // the tree data (mutated in place when nodes are dragged around)
  @Input() nodes: TreeNode[] = [];

  // currently selected nodes (two-way bindable)
  @Input() selectedNodes: TreeNode[] = [];

  // decide whether a node may be dragged
  @Input() allowDrag: (node: TreeNode) => boolean = () => true;

  // decide whether the dragged nodes may be dropped onto a target/zone
  @Input() allowDrop: (dragged: TreeNode[], target: TreeNode, zone: TreeDropZone) => boolean = () => true;

  @Output() selectedNodesChange = new EventEmitter<TreeNode[]>();

  // a (non-folder) leaf was activated by a plain click
  @Output() activate = new EventEmitter<TreeNode>();

  // the tree structure changed because of a drag & drop move
  @Output() nodesChange = new EventEmitter<TreeNode[]>();

  // custom node content, provided as <ng-template #nodeTemplate let-node>
  @ContentChild('nodeTemplate') nodeTemplate?: TemplateRef<any>;

  // the visible (expanded) nodes, flattened for rendering
  flatNodes: FlatNode[] = [];

  // currently dragged nodes and the live drop indicator
  draggingNodes: TreeNode[] = [];
  drop: DropTarget | null = null;
  // hovering the trailing strip drops at the very end of the root level
  dropTail = false;

  // indentation of one tree level, in px (must match the template/CSS)
  private static readonly INDENT_STEP = 15;
  private static readonly INDENT_BASE = 4;

  private selection = new Set<TreeNode>();
  private lastClickedIndex: number | null = null;
  private flatByNode = new Map<TreeNode, FlatNode>();

  indentPx(level: number): string {
    return this.indent(level) + 'px';
  }

  private indent(level: number): number {
    return level * TreeComponent.INDENT_STEP + TreeComponent.INDENT_BASE;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedNodes']) {
      this.selection = new Set(this.selectedNodes ?? []);
    }
    this.rebuild();
  }

  isSelected(node: TreeNode): boolean {
    return this.selection.has(node);
  }

  isDragging(node: TreeNode): boolean {
    return this.draggingNodes.includes(node);
  }

  toggleExpand(node: TreeNode): void {
    node.expanded = !node.expanded;
    this.rebuild();
  }

  // ---- selection / clicking ----------------------------------------------

  onRowClick(flat: FlatNode, event: MouseEvent): void {
    const node = flat.node;
    const index = this.flatNodes.indexOf(flat);

    if (event.shiftKey && this.lastClickedIndex !== null) {
      this.selectRange(this.lastClickedIndex, index, event.ctrlKey || event.metaKey);
    } else if (event.ctrlKey || event.metaKey) {
      if (this.selection.has(node)) {
        this.selection.delete(node);
      } else {
        this.selection.add(node);
      }
      this.lastClickedIndex = index;
    } else {
      // plain click: folders toggle, leaves activate; either way select just this row
      if (node.isFolder) {
        this.toggleExpand(node);
      }
      this.selection.clear();
      this.selection.add(node);
      this.lastClickedIndex = index;
      if (!node.isFolder) {
        this.activate.emit(node);
      }
    }

    this.selectedNodesChange.emit([...this.selection]);
  }

  private selectRange(from: number, to: number, additive: boolean): void {
    if (!additive) {
      this.selection.clear();
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    for (let i = lo; i <= hi && i < this.flatNodes.length; i++) {
      this.selection.add(this.flatNodes[i].node);
    }
  }

  // ---- drag & drop --------------------------------------------------------

  onDragStart(flat: FlatNode, event: DragEvent): void {
    const node = flat.node;
    if (!this.allowDrag(node)) {
      event.preventDefault();
      return;
    }

    // dragging an unselected node makes it the sole selection
    if (!this.selection.has(node)) {
      this.selection.clear();
      this.selection.add(node);
      this.lastClickedIndex = this.flatNodes.indexOf(flat);
      this.selectedNodesChange.emit([...this.selection]);
    }

    // drag the whole selection, but never a node together with its own ancestor
    this.draggingNodes = this.removeNested([...this.selection]);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // required for Firefox to start a native drag
      event.dataTransfer.setData('text/plain', node.name ?? '');
    }
  }

  onDragOver(flat: FlatNode, event: DragEvent): void {
    if (!this.draggingNodes.length) {
      return;
    }

    const resolved = this.resolveDrop(flat, event.currentTarget as HTMLElement, event.clientX, event.clientY);
    if (!this.canDrop(resolved.ref, resolved.zone)) {
      this.clearIndicator();
      return;
    }

    // preventDefault marks this as a valid drop location
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.drop = resolved;
    this.dropTail = false;
  }

  onDrop(flat: FlatNode, event: DragEvent): void {
    event.preventDefault();
    if (this.drop) {
      this.moveNodes(this.draggingNodes, this.drop.ref, this.drop.zone);
      this.nodesChange.emit(this.nodes);
    }
    this.endDrag();
  }

  // The strip below the last row: drop after the last folder, at the root level.
  // (The last folder has no following row to act as a "before" drop target.)
  onTailDragOver(event: DragEvent): void {
    if (!this.draggingNodes.length) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.drop = null;
    this.dropTail = true;
  }

  onTailDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.draggingNodes.length) {
      this.detachAll(this.draggingNodes);
      this.nodes.push(...this.draggingNodes);
      this.nodesChange.emit(this.nodes);
    }
    this.endDrag();
  }

  onDragEnd(): void {
    this.endDrag();
  }

  private endDrag(): void {
    this.draggingNodes = [];
    this.clearIndicator();
    this.rebuild();
  }

  private clearIndicator(): void {
    this.drop = null;
    this.dropTail = false;
  }

  // Resolve the hovered row + cursor position into a drop target.
  //  - top of a row        -> before it
  //  - middle of a folder  -> inside it
  //  - bottom of a row     -> after it (see afterRow for the inside/outside choice)
  // An expanded, non-empty folder has no "after" band on its header: dropping
  // after such a folder happens at the bottom of its last child instead, so the
  // indicator lands at the folder's visual end rather than under its header.
  private resolveDrop(flat: FlatNode, row: HTMLElement, clientX: number, clientY: number): DropTarget {
    const node = flat.node;
    const rect = row.getBoundingClientRect();
    const offset = clientY - rect.top;

    if (node.isFolder) {
      if (offset < rect.height * 0.3) {
        return { row: node, zone: 'before', ref: node, indent: this.indent(flat.level) };
      }
      const expandedWithChildren = !!node.expanded && !!node.children?.length;
      if (expandedWithChildren || offset <= rect.height * 0.7) {
        return { row: node, zone: 'inside', ref: node, indent: this.indent(flat.level) };
      }
      return this.afterRow(flat, clientX, rect.left);
    }

    if (offset < rect.height / 2) {
      return { row: node, zone: 'before', ref: node, indent: this.indent(flat.level) };
    }
    return this.afterRow(flat, clientX, rect.left);
  }

  // "after" the hovered row. When the row is the last child of its subtree, the
  // horizontal cursor position chooses the level: keep the node inside next to
  // the row, or outdent to drop after one of its ancestor folders. The indicator
  // stays at this row's bottom edge but is indented to the chosen level.
  private afterRow(flat: FlatNode, clientX: number, rowLeft: number): DropTarget {
    const next = this.flatNodes[this.flatNodes.indexOf(flat) + 1];

    // not the last node of a subtree -> unambiguous "after this row"
    if (next && next.level >= flat.level) {
      return { row: flat.node, zone: 'after', ref: flat.node, indent: this.indent(flat.level) };
    }

    // last child: pick a drop level between the next visible row's level (how far
    // we may outdent) and this row's own level, from the cursor's x position
    const minLevel = next ? next.level : 0;
    const level = Math.max(
      minLevel,
      Math.min(flat.level, Math.round((clientX - rowLeft - TreeComponent.INDENT_BASE) / TreeComponent.INDENT_STEP))
    );

    // walk up to the ancestor sitting at the chosen level
    let ancestor: FlatNode | undefined = flat;
    while (ancestor && ancestor.level > level) {
      ancestor = ancestor.parent ? this.flatByNode.get(ancestor.parent) : undefined;
    }

    return { row: flat.node, zone: 'after', ref: ancestor?.node ?? flat.node, indent: this.indent(level) };
  }

  private canDrop(ref: TreeNode, zone: TreeDropZone): boolean {
    if (this.draggingNodes.includes(ref)) {
      return false;
    }
    // cannot drop a node into its own subtree
    if (this.draggingNodes.some((dragged) => this.contains(dragged, ref))) {
      return false;
    }
    if (zone === 'inside' && !ref.isFolder) {
      return false;
    }
    return this.allowDrop(this.draggingNodes, ref, zone);
  }

  private moveNodes(dragged: TreeNode[], ref: TreeNode, zone: TreeDropZone): void {
    this.detachAll(dragged);

    if (zone === 'inside') {
      ref.children = ref.children ?? [];
      ref.children.push(...dragged);
      ref.isFolder = true;
      ref.expanded = true;
      return;
    }

    const location = this.locate(ref);
    if (!location) {
      this.nodes.push(...dragged);
      return;
    }
    const insertAt = location.index + (zone === 'after' ? 1 : 0);
    location.list.splice(insertAt, 0, ...dragged);
  }

  // detach every dragged node from its current parent (re-locate each time, so
  // indices stay correct while the arrays are being spliced)
  private detachAll(dragged: TreeNode[]): void {
    for (const node of dragged) {
      const location = this.locate(node);
      if (location) {
        location.list.splice(location.index, 1);
      }
    }
  }

  // ---- tree helpers -------------------------------------------------------

  private rebuild(): void {
    this.flatNodes = [];
    this.flatByNode.clear();
    this.flatten(this.nodes ?? [], 0, null);
  }

  private flatten(list: TreeNode[], level: number, parent: TreeNode | null): void {
    for (const node of list) {
      const flat: FlatNode = { node, level, parent };
      this.flatNodes.push(flat);
      this.flatByNode.set(node, flat);
      if (node.isFolder && node.expanded && node.children?.length) {
        this.flatten(node.children, level + 1, node);
      }
    }
  }

  // drop nodes that are already contained in another node of the set
  private removeNested(nodes: TreeNode[]): TreeNode[] {
    return nodes.filter((node) => !nodes.some((other) => other !== node && this.contains(other, node)));
  }

  // is `node` somewhere inside `ancestor`'s subtree?
  private contains(ancestor: TreeNode, node: TreeNode): boolean {
    if (!ancestor.children) {
      return false;
    }
    for (const child of ancestor.children) {
      if (child === node || this.contains(child, node)) {
        return true;
      }
    }
    return false;
  }

  // find the array and index that currently hold `target`
  private locate(target: TreeNode, list: TreeNode[] = this.nodes): { list: TreeNode[]; index: number } | null {
    for (let i = 0; i < list.length; i++) {
      if (list[i] === target) {
        return { list, index: i };
      }
      const children = list[i].children;
      if (children?.length) {
        const found = this.locate(target, children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }
}
