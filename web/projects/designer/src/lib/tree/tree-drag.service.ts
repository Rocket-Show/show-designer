import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { TreeNode } from './tree.component';

/**
 * Carries nodes which are dragged into a tree from the outside (e.g. from a list
 * next to it). The payload cannot be read from the DragEvent itself, because the
 * browser only hands out the transferred data on drop, not while dragging over.
 *
 * External nodes are inserted as they are, the source list keeps its own items.
 */
@Injectable({
  providedIn: 'root',
})
export class TreeDragService {
  // the nodes currently dragged in from outside a tree
  nodes: TreeNode[] = [];

  // fires, when such a drag has ended (dropped or cancelled)
  ended: Subject<void> = new Subject<void>();

  start(nodes: TreeNode[]) {
    this.nodes = nodes;
  }

  end() {
    this.nodes = [];
    this.ended.next();
  }
}
