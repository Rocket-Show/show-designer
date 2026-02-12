import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Preset } from '../models/preset';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { PresetSettingsComponent } from './preset-settings/preset-settings.component';
import { IActionMapping, ITreeOptions, KEYS, TREE_ACTIONS } from '@ali-hm/angular-tree-component';

@Component({
  selector: 'lib-app-preset',
  templateUrl: './preset.component.html',
  styleUrls: ['./preset.component.css'],
  standalone: false,
})
export class PresetComponent implements OnInit {
  treeOptions: ITreeOptions;
  treeNodes: any;

  @ViewChild('tree')
  tree: ElementRef;

  constructor(
    public presetService: PresetService,
    public sceneService: SceneService,
    public projectService: ProjectService,
    public introService: IntroService,
    private modalService: BsModalService
  ) {
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

  ngOnInit() {}

  onActivate(event: any) {
    console.log(event);
  }

  selectPreset(index: number) {
    this.projectService.project.previewPreset = true;
    this.presetService.selectPreset(index);
  }

  enableCheckbox(): boolean {
    return this.sceneService.selectedScenes && this.sceneService.selectedScenes.length === 1;
  }

  activatePreset(active: boolean, index: number) {
    if (this.sceneService.selectedScenes && this.sceneService.selectedScenes.length === 1) {
      const uuid = this.projectService.project.presets[index].uuid;

      if (active) {
        // Activate a new uuid
        this.sceneService.selectedScenes[0].presetUuids.push(uuid);
      } else {
        // Remove the uuid
        for (let i = 0; i < this.sceneService.selectedScenes[0].presetUuids.length; i++) {
          if (this.sceneService.selectedScenes[0].presetUuids[i] === uuid) {
            this.sceneService.selectedScenes[0].presetUuids.splice(i, 1);
            return;
          }
        }
      }
    }
  }

  addPreset() {
    this.presetService.addPreset();

    if (this.sceneService.selectedScenes && this.sceneService.selectedScenes.length === 1) {
      this.sceneService.selectedScenes[0].presetUuids.push(this.presetService.selectedPreset.uuid);
    }
  }

  removePreset() {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.projectService.project.presets.splice(this.projectService.project.presets.indexOf(this.presetService.selectedPreset), 1);
    this.presetService.selectPreset(0);
  }

  openSettings(preset: Preset) {
    const bsModalRef = this.modalService.show(PresetSettingsComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { preset },
    });
  }
}
