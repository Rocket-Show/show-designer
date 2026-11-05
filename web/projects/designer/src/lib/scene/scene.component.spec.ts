import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';

import { InlineEditComponent } from '../inline-edit/inline-edit.component';
import { Folder } from '../models/folder';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { PresetSettingsComponent } from '../preset/preset-settings/preset-settings.component';
import { ColorService } from '../services/color.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TreeComponent, TreeNode } from '../tree/tree.component';
import { SceneSettingsComponent } from './scene-settings/scene-settings.component';
import { SceneComponent } from './scene.component';

// The scene list: the scenes grouped in folders, each with the presets it layers. A scene
// clicked is played, a preset clicked inside it is edited, and the buttons on top act on
// whatever was clicked last.
describe('SceneComponent', () => {
  let fixture: ComponentFixture<SceneComponent>;
  let element: HTMLElement;
  let project: Project;
  let sceneService: SceneService;
  let presetService: PresetService;
  let previewLive: jasmine.Spy;
  let showModal: jasmine.Spy;

  beforeEach(async () => {
    showModal = jasmine.createSpy('show');

    await TestBed.configureTestingModule({
      declarations: [SceneComponent, TreeComponent, InlineEditComponent],
      imports: [FormsModule, PopoverModule.forRoot(), TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalService, useValue: { show: showModal } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { designer: { misc: { 'copy-name': '{{name}} copy' }, scene: { 'new-folder': 'New Folder' } } });
    translate.use('en');

    project = new Project({
      presets: [
        { uuid: 'red', name: 'Red', color: '#ff0000', colorAuto: false },
        { uuid: 'blue', name: 'Blue', color: '#0000ff', colorAuto: false },
        { uuid: 'green', name: 'Green' },
      ],
      sceneFolders: [{ uuid: 'songs', name: 'Songs', sortIndex: 1 }],
      scenes: [
        { uuid: 'verse', name: 'Verse', presetUuids: ['red', 'blue'], sortIndex: 0, icon: 'fa-star' },
        { uuid: 'chorus', name: 'Chorus', presetUuids: ['blue'], folderUuid: 'songs', sortIndex: 0 },
        { uuid: 'outro', name: 'Outro', dimmer: 0.5, sortIndex: 2, color: '#00ff00' },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    sceneService = TestBed.inject(SceneService);
    presetService = TestBed.inject(PresetService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    fixture = TestBed.createComponent(SceneComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  const component = () => fixture.componentInstance;
  const scene = (uuid: string): Scene => project.scenes.find((candidate) => candidate.uuid === uuid);
  const preset = (uuid: string): Preset => project.presets.find((candidate) => candidate.uuid === uuid);
  const rows = (): HTMLElement[] => Array.from(element.querySelectorAll('.tree-node'));
  const label = (row: HTMLElement): string => row.querySelector('.tree-label .text-truncate').textContent.trim();
  const labels = (): string[] => rows().map(label);

  // the row with that label, the nth one if there are several (a preset in two scenes)
  function row(text: string, index = 0): HTMLElement {
    return rows().filter((candidate) => label(candidate) === text)[index];
  }

  function click(text: string, index = 0, init: MouseEventInit = {}) {
    row(text, index).dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
    fixture.detectChanges();
  }

  function headerButton(icon: string): HTMLElement {
    return Array.from(element.querySelectorAll<HTMLElement>('.card-header a')).find((button) => !!button.querySelector('.' + icon));
  }

  function press(icon: string) {
    headerButton(icon).click();
    fixture.detectChanges();
  }

  // the node of the tree with that id (a scene, a folder, or "scene/preset")
  function node(id: string, nodes: TreeNode[] = component().treeNodes): TreeNode {
    for (const candidate of nodes) {
      if (candidate.id === id) {
        return candidate;
      }

      const found = node(id, candidate.children ?? []);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  const selected = (): string[] =>
    rows()
      .filter((candidate) => candidate.classList.contains('selected'))
      .map(label);
  const focused = (): string[] =>
    rows()
      .filter((candidate) => candidate.classList.contains('focused'))
      .map(label);

  it('shows the scenes in their folders, each with the presets it layers', () => {
    expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'Outro']);
  });

  it('marks the scenes and the presets with their icons and colors', () => {
    const icon = (text: string) => row(text).querySelector<HTMLElement>('.tree-icon');
    const colorService = TestBed.inject(ColorService);

    expect(icon('Verse').classList).toContain('fa-star');
    expect(icon('Outro').classList).toContain(SceneService.defaultIcon);
    expect(icon('Songs').classList).toContain('fa-folder-open-o');
    expect(node('verse').iconColor).toBe(colorService.getSceneColor(scene('verse')));
    expect(icon('Outro').style.color).toBe('rgb(0, 255, 0)');
    expect(icon('Red').style.color).toBe('rgb(255, 0, 0)');
  });

  it('says how far a dimmed scene is held down', () => {
    expect(row('Outro').querySelector('.scene-dimmer').textContent.trim()).toBe('50%');
    expect(row('Verse').querySelector('.scene-dimmer')).toBeNull();
  });

  it('shows a closed scene without its presets', () => {
    scene('verse').expanded = false;
    sceneService.scenesChanged.next();
    fixture.detectChanges();

    expect(labels()).toEqual(['Verse', 'Songs', 'Chorus', 'Blue', 'Outro']);
  });

  it('plays the scene clicked', () => {
    click('Outro');

    expect(sceneService.selectedScenes).toEqual([scene('outro')]);
    expect(project.selectedSceneUuids).toEqual(['outro']);
    expect(previewLive).toHaveBeenCalled();
    expect(selected()).toEqual(['Outro']);
    expect(focused()).toEqual(['Outro']);
  });

  // the ring went to the first folder, as if it had been clicked: the trash would not remove it
  it('marks no row as clicked last, before one is clicked', () => {
    expect(focused()).toEqual([]);

    sceneService.selectScenes([scene('outro')]);
    fixture.detectChanges();

    expect(focused()).toEqual([]);
  });

  it('plays several scenes clicked with ctrl', () => {
    click('Verse');
    click('Outro', 0, { ctrlKey: true });

    expect(sceneService.selectedScenes).toEqual([scene('verse'), scene('outro')]);
    expect(selected()).toEqual(['Verse', 'Outro']);
  });

  it('edits the preset clicked, playing its scene', () => {
    click('Blue', 1);

    expect(sceneService.selectedScenes).toEqual([scene('chorus')]);
    expect(presetService.selectedPreset).toBe(preset('blue'));
    expect(selected()).toEqual(['Chorus', 'Blue']);
    expect(focused()).toEqual(['Blue']);
    expect(rows().indexOf(rows().find((candidate) => candidate.classList.contains('focused')))).toBe(5);
  });

  it('takes the mark off the preset, once another one is edited', () => {
    click('Red');
    expect(focused()).toEqual(['Red']);

    presetService.selectPreset(project.presets.indexOf(preset('green')));
    fixture.detectChanges();

    expect(focused()).toEqual(['Verse']);
    expect(selected()).toEqual(['Verse']);
  });

  it('marks the scenes played from somewhere else, the timeline for one', () => {
    sceneService.selectScenes([scene('chorus')]);
    fixture.detectChanges();

    expect(selected()).toEqual(['Chorus']);
  });

  it('shows the scenes of a project loaded', () => {
    TestBed.inject(ProjectService).project = new Project({ scenes: [{ uuid: 'other', name: 'Other' }] });
    TestBed.inject(ProjectService).projectChanged.next();
    fixture.detectChanges();

    expect(labels()).toEqual(['Other']);
  });

  it('shows the presets added or removed', () => {
    project.presets.push(new Preset({ uuid: 'white', name: 'White' }));
    scene('outro').presetUuids.push('white');
    presetService.presetsChanged.next();
    fixture.detectChanges();

    expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'Outro', 'White']);
  });

  it('repaints the icons, as the colors of the presets change', () => {
    const verseColor = node('verse').iconColor;
    preset('red').color = '#ffffff';
    presetService.capabilityValuesChanged.next();
    fixture.detectChanges();

    expect(row('Red').querySelector<HTMLElement>('.tree-icon').style.color).toBe('rgb(255, 255, 255)');
    expect(node('verse').iconColor).not.toBe(verseColor);
  });

  it('opens and closes a scene, and keeps that with the project', () => {
    row('Verse').querySelector<HTMLElement>('.tree-caret').click();
    fixture.detectChanges();

    expect(scene('verse').expanded).toBe(false);
    expect(labels()).toEqual(['Verse', 'Songs', 'Chorus', 'Blue', 'Outro']);
    // opening and closing it does not play it
    expect(sceneService.selectedScenes).toEqual([]);
  });

  it('opens and closes a folder with a click, and keeps that with the project', () => {
    click('Songs');

    expect(project.sceneFolders[0].expanded).toBe(false);
    expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Outro']);
    expect(row('Songs').querySelector('.tree-icon').classList).toContain('fa-folder-o');

    click('Songs');
    expect(project.sceneFolders[0].expanded).toBe(true);
  });

  it('closes all scenes and folders, and opens them again once all are closed', () => {
    press('fa-compress');

    expect(project.scenes.every((candidate) => candidate.expanded === false)).toBe(true);
    expect(project.sceneFolders[0].expanded).toBe(false);
    expect(labels()).toEqual(['Verse', 'Songs', 'Outro']);
    expect(headerButton('fa-compress')).toBeUndefined();

    press('fa-expand');

    expect(project.scenes.every((candidate) => candidate.expanded)).toBe(true);
    expect(labels().length).toBe(7);
  });

  it('closes everything, as long as one scene is still open', () => {
    scene('verse').expanded = false;
    project.sceneFolders[0].expanded = false;
    sceneService.scenesChanged.next();
    fixture.detectChanges();

    press('fa-compress');

    expect(project.scenes.some((candidate) => candidate.expanded)).toBe(false);
  });

  describe('adding a scene', () => {
    it('adds it at the end, while nothing is clicked', () => {
      press('fa-plus');

      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'Outro', 'New Scene']);
      expect(selected()).toEqual(['New Scene']);
      expect(focused()).toEqual(['New Scene']);
    });

    it('adds it right above the scene clicked last', () => {
      click('Outro');
      press('fa-plus');

      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'New Scene', 'Outro']);
      expect(focused()).toEqual(['New Scene']);
    });

    it('adds it inside the folder of the scene clicked last', () => {
      click('Chorus');
      press('fa-plus');

      const added = project.scenes.find((candidate) => candidate.name === 'New Scene');
      expect(added.folderUuid).toBe('songs');
      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'New Scene', 'Chorus', 'Blue', 'Outro']);
    });

    it('adds it at the end of the folder clicked last', () => {
      click('Songs');
      click('Songs');
      press('fa-plus');

      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'New Scene', 'Outro']);
      expect(project.scenes.find((candidate) => candidate.name === 'New Scene').folderUuid).toBe('songs');
    });
  });

  describe('copying', () => {
    it('copies the scene clicked last, right below it', () => {
      click('Verse');
      press('fa-clone');

      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Verse copy', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'Outro']);
      expect(focused()).toEqual(['Verse copy']);
      expect(project.scenes.find((candidate) => candidate.name === 'Verse copy').presetUuids).toEqual(['red', 'blue']);
    });

    it('copies the scene played, while nothing is clicked', () => {
      sceneService.selectScenes([scene('outro')]);
      press('fa-clone');

      expect(labels().slice(-2)).toEqual(['Outro', 'Outro copy']);
    });

    it('copies nothing, while no scene is played or clicked', () => {
      press('fa-clone');

      expect(project.scenes.length).toBe(3);
    });

    it('copies the preset clicked last, layered right below it in its scene', () => {
      click('Red');
      expect(component().duplicateLabel()).toBe('designer.scene.duplicate-preset');

      press('fa-clone');

      const copy = project.presets.find((candidate) => candidate.name === 'Red copy');
      expect(scene('verse').presetUuids).toEqual(['red', copy.uuid, 'blue']);
      expect(labels()).toEqual(['Verse', 'Red', 'Red copy', 'Blue', 'Songs', 'Chorus', 'Blue', 'Outro']);
      expect(focused()).toEqual(['Red copy']);
      expect(presetService.selectedPreset).toBe(copy);
    });

    it('copies a scene, once a scene is clicked after a preset', () => {
      click('Red');
      click('Outro');

      expect(component().duplicateLabel()).toBe('designer.scene.duplicate');
    });
  });

  describe('adding a folder', () => {
    it('adds it next to the scene clicked last', () => {
      click('Chorus');
      press('fa-folder-o');

      const folder = project.sceneFolders.find((candidate) => candidate.name === 'New Folder');
      expect(folder.parentUuid).toBe('songs');
      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue', 'New Folder', 'Outro']);
      expect(focused()).toEqual(['New Folder']);
    });

    it('adds it next to the folder clicked last', () => {
      click('Songs');
      press('fa-folder-o');

      expect(project.sceneFolders.find((candidate) => candidate.name === 'New Folder').parentUuid).toBeUndefined();
      expect(labels().slice(-1)).toEqual(['New Folder']);
    });
  });

  describe('removing', () => {
    it('removes the scene clicked last', () => {
      click('Outro');
      expect(component().removeLabel()).toBe('designer.scene.remove');

      press('fa-trash-o');

      expect(project.scenes.map((candidate) => candidate.uuid)).toEqual(['verse', 'chorus']);
      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Chorus', 'Blue']);

      // the first scene is played now, nothing is marked as clicked
      expect(selected()).toEqual(['Verse']);
      expect(focused()).toEqual([]);
    });

    it('removes the scene played, while nothing is clicked', () => {
      sceneService.selectScenes([scene('chorus')]);
      press('fa-trash-o');

      expect(project.scenes.map((candidate) => candidate.uuid)).toEqual(['verse', 'outro']);
    });

    it('removes nothing, while no scene is played or clicked', () => {
      press('fa-trash-o');

      expect(project.scenes.length).toBe(3);
    });

    it('removes the preset clicked last from its scene, not from the project', () => {
      click('Red');
      expect(component().removeLabel()).toBe('designer.scene.remove-preset');

      press('fa-trash-o');

      expect(scene('verse').presetUuids).toEqual(['blue']);
      expect(project.presets.length).toBe(3);
      expect(labels()).toEqual(['Verse', 'Blue', 'Songs', 'Chorus', 'Blue', 'Outro']);
      expect(focused()).toEqual(['Verse']);

      // the scene is what is removed next
      expect(component().removeLabel()).toBe('designer.scene.remove');
    });

    it('removes the folder clicked last, keeping the scenes in it in its place', () => {
      click('Songs');
      expect(component().removeLabel()).toBe('designer.scene.remove-folder');

      press('fa-trash-o');

      expect(project.sceneFolders).toEqual([]);
      expect(scene('chorus').folderUuid).toBeUndefined();
      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Chorus', 'Blue', 'Outro']);
      expect(project.scenes.map((candidate) => candidate.uuid)).toEqual(['verse', 'chorus', 'outro']);
    });
  });

  it('renames a folder in place', async () => {
    const folderRow = row('Songs');
    folderRow.querySelector<HTMLElement>('.inline-edit-value').click();
    fixture.detectChanges();

    // the click goes to the name, not to the folder
    expect(project.sceneFolders[0].expanded).toBe(true);

    const input = folderRow.querySelector<HTMLInputElement>('input');
    await fixture.whenStable();
    input.value = 'Ballads';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(project.sceneFolders[0].name).toBe('Ballads');
  });

  describe('opening the settings', () => {
    it('opens the settings of a scene with its button, without playing it', () => {
      row('Outro').querySelector<HTMLElement>('button').click();

      expect(showModal).toHaveBeenCalledWith(SceneSettingsComponent, {
        keyboard: true,
        ignoreBackdropClick: false,
        class: '',
        initialState: { scene: scene('outro') },
      });
      expect(sceneService.selectedScenes).toEqual([]);
    });

    it('opens the settings of a scene with a double click', () => {
      row('Verse').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(showModal).toHaveBeenCalledWith(SceneSettingsComponent, jasmine.objectContaining({ initialState: { scene: scene('verse') } }));
    });

    it('opens the settings of a preset layered in a scene with a double click', () => {
      row('Blue').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(showModal).toHaveBeenCalledWith(PresetSettingsComponent, {
        keyboard: true,
        ignoreBackdropClick: false,
        class: '',
        initialState: { preset: preset('blue') },
      });
    });

    it('opens nothing with a double click on a folder', () => {
      row('Songs').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(showModal).not.toHaveBeenCalled();
    });
  });

  // a node of the preset tree, dragged in from the preset list
  const presetNode = (uuid: string): TreeNode => ({ id: uuid, isFolder: false, preset: preset(uuid) });
  const presetFolderNode = (...uuids: string[]): TreeNode => ({
    id: 'folder',
    isFolder: true,
    folder: {},
    children: uuids.map(presetNode),
  });

  describe('deciding where a drag may be dropped', () => {
    const allowDrop = (dragged: TreeNode[], target: TreeNode, zone: 'before' | 'after' | 'inside') =>
      component().allowDrop(dragged, target, zone);

    it('puts a scene next to another one or into a folder, never into a scene', () => {
      const outro = node('outro');

      expect(allowDrop([outro], node('verse'), 'before')).toBe(true);
      expect(allowDrop([outro], node('songs'), 'after')).toBe(true);
      expect(allowDrop([outro], node('songs'), 'inside')).toBe(true);
      expect(allowDrop([outro], node('verse'), 'inside')).toBe(false);
      expect(allowDrop([outro], node('verse/red'), 'after')).toBe(false);
    });

    it('puts a folder of scenes next to a scene or into another folder', () => {
      expect(allowDrop([node('songs')], node('outro'), 'after')).toBe(true);
      expect(allowDrop([node('songs')], node('outro'), 'inside')).toBe(false);
    });

    it('puts a preset into a scene, or next to a preset of a scene, never between two scenes', () => {
      const green = presetNode('green');

      expect(allowDrop([green], node('outro'), 'inside')).toBe(true);
      expect(allowDrop([green], node('verse/red'), 'before')).toBe(true);
      expect(allowDrop([green], node('verse'), 'after')).toBe(false);
      expect(allowDrop([green], node('verse/red'), 'inside')).toBe(false);
      expect(allowDrop([green], node('songs'), 'inside')).toBe(false);
    });

    it('plays a preset only once in a scene, but moves it inside its own scene', () => {
      expect(allowDrop([presetNode('blue')], node('verse'), 'inside')).toBe(false);
      expect(allowDrop([node('chorus/blue')], node('verse/red'), 'after')).toBe(false);
      expect(allowDrop([node('verse/blue')], node('verse/red'), 'before')).toBe(true);
    });

    it('puts the presets of a folder of the preset list into a scene, if it plays none of them', () => {
      expect(allowDrop([presetFolderNode('green')], node('outro'), 'inside')).toBe(true);
      expect(allowDrop([presetFolderNode('green', 'red')], node('verse'), 'inside')).toBe(false);
      expect(allowDrop([presetFolderNode()], node('outro'), 'inside')).toBe(false);
      expect(allowDrop([{ id: 'empty', isFolder: true, folder: {} }], node('outro'), 'inside')).toBe(false);
    });

    it('does not mix scenes and presets in one drop', () => {
      expect(allowDrop([node('outro'), presetNode('green')], node('songs'), 'inside')).toBe(false);
    });
  });

  describe('dropping', () => {
    const tree = (): TreeComponent => fixture.debugElement.query(By.directive(TreeComponent)).componentInstance;

    function drop(nodes: TreeNode[]) {
      tree().nodesChange.emit(nodes);
      fixture.detectChanges();
    }

    it('moves a scene into a folder, and plays the scenes in the order shown', () => {
      const [verse, songs, outro] = component().treeNodes;
      songs.children.unshift(outro);

      drop([verse, songs]);

      expect(scene('outro').folderUuid).toBe('songs');
      expect(scene('outro').sortIndex).toBe(0);
      expect(scene('chorus').sortIndex).toBe(1);
      expect(project.sceneFolders[0].sortIndex).toBe(1);
      expect(project.scenes.map((candidate) => candidate.uuid)).toEqual(['verse', 'outro', 'chorus']);
      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Songs', 'Outro', 'Chorus', 'Blue']);
      expect(previewLive).toHaveBeenCalled();
    });

    it('moves a folder into another one', () => {
      project.sceneFolders.push(new Folder({ uuid: 'ballads', name: 'Ballads', sortIndex: 3 }));
      sceneService.scenesChanged.next();
      const [verse, songs, outro, ballads] = component().treeNodes;
      ballads.children.push(songs);

      drop([verse, outro, ballads]);

      expect(project.sceneFolders.find((folder) => folder.uuid === 'songs').parentUuid).toBe('ballads');
      expect(labels()).toEqual(['Verse', 'Red', 'Blue', 'Outro', 'Ballads', 'Songs', 'Chorus', 'Blue']);
    });

    it('layers the presets of a scene in the order they are dropped in', () => {
      const verse = component().treeNodes[0];
      verse.children.reverse();

      drop(component().treeNodes);

      expect(scene('verse').presetUuids).toEqual(['blue', 'red']);
      expect(labels().slice(0, 3)).toEqual(['Verse', 'Blue', 'Red']);
    });

    it('plays the presets dropped in from the preset list, a folder of them as well', () => {
      const [, , outro] = component().treeNodes;
      outro.children.push(presetFolderNode('green', 'red'), presetNode('green'));

      drop(component().treeNodes);

      expect(scene('outro').presetUuids).toEqual(['green', 'red']);
      expect(labels().slice(-3)).toEqual(['Outro', 'Green', 'Red']);
    });
  });
});
