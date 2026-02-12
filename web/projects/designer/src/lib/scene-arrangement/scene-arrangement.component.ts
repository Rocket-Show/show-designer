import { Component } from '@angular/core';
import { IntroService } from '../services/intro.service';
import { IActionMapping, ITreeOptions, KEYS, TREE_ACTIONS } from '@ali-hm/angular-tree-component';

@Component({
  selector: 'lib-app-scene-arrangement',
  templateUrl: './scene-arrangement.component.html',
  styleUrl: './scene-arrangement.component.css',
  standalone: false,
})
export class SceneArrangementComponent {
  treeOptions: ITreeOptions;
  treeNodes: any;

  constructor(public introService: IntroService) {
    let actionMapping: IActionMapping = {
      mouse: {
        click: (tree, node, $event) => {
          // block activation for folders (or any condition you want)
          if (node.data.isFolder) {
            // optional: make click expand/collapse instead
            TREE_ACTIONS.TOGGLE_EXPANDED(tree, node, $event);
            return;
          }

          TREE_ACTIONS.ACTIVATE(tree, node, $event);
        },
      },
      keys: {
        [KEYS.ENTER]: (tree, node, $event) => {
          if (!node.data.isFolder) TREE_ACTIONS.ACTIVATE(tree, node, $event);
        },
        [KEYS.SPACE]: (tree, node, $event) => {
          if (!node.data.isFolder) TREE_ACTIONS.ACTIVATE(tree, node, $event);
        },
      },
    };

    this.treeOptions = {
      displayField: 'name',
      isExpandedField: 'expanded',
      idField: 'uuid',
      hasChildrenField: 'isFolder',
      actionMapping: actionMapping,
      nodeHeight: 23,
      allowDrag: (node) => {
        return true;
      },
      allowDrop: (node, target) => {
        // only allow dropping into folders or to the root level
        return !target.parent.data.id || target.parent.data.isFolder;
      },
      allowDragoverStyling: true,
      levelPadding: 20,
      useVirtualScroll: true,
      animateExpand: true,
      scrollOnActivate: true,
      animateSpeed: 10,
      animateAcceleration: 1.2,
      scrollContainer: document.documentElement,
    };

    this.treeNodes = [
      {
        id: 1,
        name: 'root1',
        isFolder: true,
        children: [
          { id: 2, name: 'child1', isFolder: false },
          { id: 3, name: 'child2', isFolder: false },
          {
            id: 1,
            name: 'root1',
            isFolder: true,
            children: [
              { id: 2, name: 'child1', isFolder: false },
              { id: 3, name: 'child2', isFolder: false },
            ],
          },
        ],
      },
      {
        id: 4,
        name: 'root1',
        isFolder: true,
        children: [
          { id: 5, name: 'child1', isFolder: false },
          { id: 6, name: 'child2', isFolder: false },
        ],
      },
    ];
  }

  up() {}
  down() {}

  onActivate(event: any) {
    console.log(event);
  }
}
