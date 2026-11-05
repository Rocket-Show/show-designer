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
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { FixtureProfile } from '../models/fixture-profile';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TreeComponent, TreeNode } from '../tree/tree.component';
import { PresetSettingsComponent } from './preset-settings/preset-settings.component';
import { PresetComponent } from './preset.component';

// The list of all presets of the project, grouped in folders: it picks the preset being
// edited, adds, copies and removes presets and folders, and puts the presets into the scene
// selected in the scene list.
describe('PresetComponent', () => {
  let fixture: ComponentFixture<PresetComponent>;
  let component: PresetComponent;
  let element: HTMLElement;
  let project: Project;
  let presetService: PresetService;
  let sceneService: SceneService;
  let modalService: { show: jasmine.Spy };

  beforeEach(async () => {
    modalService = { show: jasmine.createSpy('show') };

    await TestBed.configureTestingModule({
      declarations: [PresetComponent, TreeComponent, InlineEditComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalService, useValue: modalService },
      ],
    }).compileComponents();

    spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en', { designer: { misc: { 'copy-name': '{{name}} copy' } } });
    translateService.use('en');

    // red on top, the warm folder holding amber below it and white at the bottom
    project = new Project({
      presetFolders: [{ uuid: 'warm', name: 'Warm', sortIndex: 1 }],
      presets: [
        {
          uuid: 'red',
          name: 'Red',
          sortIndex: 0,
          steps: [
            {
              uuid: 'red-step',
              fixtureCapabilityValues: [
                { type: 'ColorIntensity', color: 'Red', valuePercentage: 1 },
                { type: 'ColorIntensity', color: 'Green', valuePercentage: 0 },
                { type: 'ColorIntensity', color: 'Blue', valuePercentage: 0 },
              ],
            },
          ],
        },
        { uuid: 'amber', name: 'Amber', folderUuid: 'warm', sortIndex: 0, icon: 'fa-sun-o', steps: [{ uuid: 'amber-step' }] },
        { uuid: 'white', name: 'White', sortIndex: 2, steps: [{ uuid: 'white-step' }] },
      ],
      scenes: [
        { uuid: 'verse', name: 'Verse', presetUuids: ['red', 'amber'] },
        { uuid: 'chorus', name: 'Chorus', presetUuids: [] },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    presetService = TestBed.inject(PresetService);
    sceneService = TestBed.inject(SceneService);

    fixture = TestBed.createComponent(PresetComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function rows(): HTMLElement[] {
    return Array.from(element.querySelectorAll('.tree-node'));
  }

  function rowNames(): string[] {
    return rows().map((row) => row.querySelector('.tree-label').textContent.replace('...', '').trim());
  }

  function row(name: string): HTMLElement {
    return rows()[rowNames().indexOf(name)];
  }

  function selectedRowNames(): string[] {
    return rowNames().filter((name) => row(name).classList.contains('selected'));
  }

  function checkbox(name: string): HTMLInputElement {
    return row(name).querySelector('input[type="checkbox"]');
  }

  // the buttons in the header: solo, collapse/expand all, remove, duplicate, add folder, add
  function headerButtons(): HTMLElement[] {
    return Array.from(element.querySelectorAll('.card-header a'));
  }

  function preset(uuid: string): Preset {
    return presetService.getPresetByUuid(uuid);
  }

  function scene(uuid: string): Scene {
    return project.scenes.find((projectScene) => projectScene.uuid === uuid);
  }

  function editPreset(uuid: string) {
    presetService.selectPreset(project.presets.indexOf(preset(uuid)));
  }

  function selectScene(uuid: string) {
    sceneService.selectedScenes = [scene(uuid)];
    sceneService.sceneSelected.next();
  }

  function presetNames(): string[] {
    return project.presets.map((projectPreset) => projectPreset.name);
  }

  it('marks a preset setting values only one model of fixture of the project plays', async () => {
    project.fixtureProfiles.push(new FixtureProfile({ uuid: 'par', name: 'Par', modes: [] }));
    preset('white').steps[0].fixtureChannelValues.push(new FixtureChannelValue({ profileUuid: 'par', channelName: 'Strobe', value: 20 }));
    // a value for a model the project has no fixture of plays on nothing
    preset('red').steps[0].fixtureChannelValues.push(new FixtureChannelValue({ profileUuid: 'gone', channelName: 'Strobe', value: 20 }));
    TestBed.inject(TranslateService).setTranslation('en', { designer: { preset: { 'model-specific': '{{count}} for {{models}}' } } }, true);
    await update();

    expect(row('White').querySelector('.model-specific').getAttribute('title')).toBe('1 for Par');
    expect(row('Red').querySelector('.model-specific')).toBeNull();
    expect(row('Amber').querySelector('.model-specific')).toBeNull();
  });

  it('lists the presets in their folders, marked with their icon and color', () => {
    expect(rowNames()).toEqual(['Red', 'Warm', 'Amber', 'White']);

    const icon = (name: string) => row(name).querySelector('.tree-icon') as HTMLElement;

    expect(icon('Red').classList).toContain(PresetService.defaultIcon);
    expect(icon('Red').style.color).toBe('rgb(255, 0, 0)');
    expect(icon('Amber').classList).toContain('fa-sun-o');
    expect(icon('Warm').classList).toContain('fa-folder-open-o');
  });

  it('marks the preset being edited', async () => {
    editPreset('amber');
    await update();

    expect(selectedRowNames()).toEqual(['Amber']);
    expect(row('Amber').classList).toContain('focused');
  });

  it('edits the preset clicked', async () => {
    row('White').click();
    await update();

    expect(presetService.selectedPreset).toBe(preset('white'));
    expect(selectedRowNames()).toEqual(['White']);
  });

  it('keeps several rows selected to drag them together, as long as they hold the preset being edited', async () => {
    editPreset('red');
    await update();

    component.onSelectedNodesChange([component.treeNodes[0], component.treeNodes[2]]);
    sceneService.sceneSelected.next();
    await update();

    expect(selectedRowNames()).toEqual(['Red', 'White']);

    editPreset('amber');
    await update();

    expect(selectedRowNames()).toEqual(['Amber']);
  });

  it('repaints the icons when a preset puts another color on its fixtures', async () => {
    const values = preset('red').steps[0].fixtureCapabilityValues;
    values[0].valuePercentage = 0;
    values[2].valuePercentage = 1;

    presetService.capabilityValuesChanged.next();
    await update();

    expect((row('Red').querySelector('.tree-icon') as HTMLElement).style.color).toBe('rgb(0, 0, 255)');
  });

  it('follows the presets and the project being changed elsewhere', async () => {
    project.presets.push(new Preset({ uuid: 'blue', name: 'Blue', sortIndex: 3 }));
    presetService.presetsChanged.next();
    await update();

    expect(rowNames()).toEqual(['Red', 'Warm', 'Amber', 'White', 'Blue']);

    TestBed.inject(ProjectService).project = new Project({ presets: [{ uuid: 'other', name: 'Other' }] });
    TestBed.inject(ProjectService).projectChanged.next();
    await update();

    expect(rowNames()).toEqual(['Other']);
  });

  it('puts a preset into the scene selected, on top of it, or takes it out again', async () => {
    selectScene('verse');
    await update();

    expect(['Red', 'Amber', 'White'].map((name) => checkbox(name).checked)).toEqual([true, true, false]);
    expect(row('White').querySelector('.inactive-list-item')).not.toBeNull();

    checkbox('White').click();
    expect(scene('verse').presetUuids).toEqual(['white', 'red', 'amber']);

    checkbox('Red').click();
    expect(scene('verse').presetUuids).toEqual(['white', 'amber']);
  });

  it('only puts presets into a scene while a single one is selected', async () => {
    expect(checkbox('Red').disabled).toBe(true);

    sceneService.selectedScenes = [scene('verse'), scene('chorus')];
    await update();

    expect(checkbox('Red').disabled).toBe(true);

    component.activatePreset(true, preset('white'));
    expect(scene('verse').presetUuids).toEqual(['red', 'amber']);
    expect(scene('chorus').presetUuids).toEqual([]);
  });

  it('plays the preset being edited on its own', async () => {
    headerButtons()[0].click();
    await update();

    expect(project.previewPreset).toBe(true);
    expect(headerButtons()[0].classList).toContain('text-primary');

    headerButtons()[0].click();
    expect(project.previewPreset).toBe(false);
  });

  it('collapses all folders, or expands them all again', async () => {
    const toggle = () => headerButtons()[1];

    toggle().click();
    await update();

    expect(project.presetFolders[0].expanded).toBe(false);
    expect(rowNames()).toEqual(['Red', 'Warm', 'White']);
    expect(toggle().querySelector('i').classList).toContain('fa-expand');

    toggle().click();
    await update();

    expect(project.presetFolders[0].expanded).toBe(true);
    expect(rowNames()).toEqual(['Red', 'Warm', 'Amber', 'White']);
    expect(toggle().querySelector('i').classList).toContain('fa-compress');
  });

  it('opens and closes a folder clicked, which is what the trash then removes', async () => {
    row('Warm').click();
    await update();

    expect(project.presetFolders[0].expanded).toBe(false);
    expect(rowNames()).toEqual(['Red', 'Warm', 'White']);
    expect(row('Warm').classList).toContain('focused');
    expect(component.removeLabel()).toBe('designer.preset.remove-folder');

    row('Red').click();
    expect(component.removeLabel()).toBe('designer.preset.remove');
  });

  it('renames a folder in place', async () => {
    // the row shows a field instead of the name now
    const folderRow = row('Warm');

    (folderRow.querySelector('.inline-edit-value') as HTMLElement).click();
    await update();

    const input: HTMLInputElement = folderRow.querySelector('.inline-edit-input');
    input.value = 'Warm white';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));

    expect(project.presetFolders[0].name).toBe('Warm white');

    // the click went to the name, not to the folder
    expect(project.presetFolders[0].expanded).toBe(true);
  });

  it('adds a preset on top of the list and edits it', async () => {
    headerButtons()[5].click();
    await update();

    expect(presetNames()).toEqual(['New Preset', 'Red', 'Amber', 'White']);
    expect(presetService.selectedPreset.folderUuid).toBeUndefined();
    expect(selectedRowNames()).toEqual(['New Preset']);
  });

  it('adds a preset next to the one being edited, and right above it in the scene selected', async () => {
    editPreset('amber');
    selectScene('verse');

    component.addPreset();
    await update();

    const added = presetService.selectedPreset;

    expect(added.folderUuid).toBe('warm');
    expect(rowNames()).toEqual(['Red', 'Warm', 'New Preset', 'Amber', 'White']);
    expect(scene('verse').presetUuids).toEqual(['red', added.uuid, 'amber']);
  });

  it('adds a preset on top of the scene selected, if the preset being edited is not part of it', () => {
    editPreset('white');
    selectScene('verse');

    component.addPreset();

    expect(scene('verse').presetUuids).toEqual([presetService.selectedPreset.uuid, 'red', 'amber']);
  });

  it('adds a preset into the folder clicked last', async () => {
    row('Warm').click();
    component.addPreset();
    await update();

    expect(presetService.selectedPreset.folderUuid).toBe('warm');

    // the new preset is what the trash acts on now
    expect(component.removeLabel()).toBe('designer.preset.remove');
  });

  it('copies the preset being edited right below it, also in the scene selected', async () => {
    editPreset('red');
    selectScene('verse');

    headerButtons()[3].click();
    await update();

    const copy = presetService.selectedPreset;

    expect(copy).not.toBe(preset('red'));
    expect(presetNames()).toEqual(['Red', 'Red copy', 'Amber', 'White']);
    expect(rowNames()).toEqual(['Red', 'Red copy', 'Warm', 'Amber', 'White']);
    expect(scene('verse').presetUuids).toEqual(['red', copy.uuid, 'amber']);
  });

  it('copies a preset which is not part of the scene selected without putting it there', () => {
    editPreset('white');
    selectScene('verse');

    component.duplicatePreset();

    expect(presetNames()).toEqual(['Red', 'Amber', 'White', 'White copy']);
    expect(scene('verse').presetUuids).toEqual(['red', 'amber']);
  });

  it('copies a preset while no scene is selected', () => {
    editPreset('red');

    component.duplicatePreset();

    expect(presetNames()).toEqual(['Red', 'Red copy', 'Amber', 'White']);
    expect(scene('verse').presetUuids).toEqual(['red', 'amber']);
  });

  it('copies nothing while no preset is being edited', () => {
    component.duplicatePreset();

    expect(presetNames()).toEqual(['Red', 'Amber', 'White']);
  });

  it('adds a folder next to the preset being edited, or next to the folder clicked last', async () => {
    editPreset('amber');
    headerButtons()[4].click();

    expect(project.presetFolders.length).toBe(2);
    expect(project.presetFolders[1].name).toBe('designer.preset.new-folder');
    expect(project.presetFolders[1].parentUuid).toBe('warm');

    // the trash acts on the new folder now
    expect(component.removeLabel()).toBe('designer.preset.remove-folder');

    component.addFolder();
    expect(project.presetFolders[2].parentUuid).toBe('warm');

    await update();
    expect(rowNames()).toEqual(['Red', 'Warm', 'Amber', 'designer.preset.new-folder', 'designer.preset.new-folder', 'White']);
  });

  it('removes a folder clicked, moving its presets up into its place', async () => {
    row('Warm').click();
    headerButtons()[2].click();
    await update();

    expect(project.presetFolders).toEqual([]);
    expect(preset('amber').folderUuid).toBeUndefined();
    expect(rowNames()).toEqual(['Red', 'Amber', 'White']);
    expect(component.removeLabel()).toBe('designer.preset.remove');
  });

  it('removes the preset being edited, from the scenes as well', async () => {
    editPreset('red');

    headerButtons()[2].click();
    await update();

    expect(presetNames()).toEqual(['Amber', 'White']);
    expect(scene('verse').presetUuids).toEqual(['amber']);
    expect(rowNames()).toEqual(['Warm', 'Amber', 'White']);
  });

  it('removes nothing while nothing is being edited', () => {
    component.remove();

    expect(presetNames()).toEqual(['Red', 'Amber', 'White']);
  });

  it('opens the settings of a preset double clicked or by its button', () => {
    row('Amber').dispatchEvent(new MouseEvent('dblclick'));

    expect(modalService.show).toHaveBeenCalledWith(
      PresetSettingsComponent,
      jasmine.objectContaining({ initialState: { preset: preset('amber') } })
    );

    (row('White').querySelector('button') as HTMLButtonElement).click();

    expect(modalService.show).toHaveBeenCalledWith(
      PresetSettingsComponent,
      jasmine.objectContaining({ initialState: { preset: preset('white') } })
    );

    // a folder has no settings
    modalService.show.calls.reset();
    row('Warm').dispatchEvent(new MouseEvent('dblclick'));

    expect(modalService.show).not.toHaveBeenCalled();
  });

  it('drops presets and folders anywhere, but nothing into a preset and no folder into itself', () => {
    const [red, warm] = component.treeNodes;
    const amber = warm.children[0];

    expect(component.allowDrop([red], warm, 'inside')).toBe(true);
    expect(component.allowDrop([red], amber, 'before')).toBe(true);
    expect(component.allowDrop([red], amber, 'inside')).toBe(false);
    expect(component.allowDrop([warm], red, 'after')).toBe(true);
    expect(component.allowDrop([warm], amber, 'after')).toBe(false);
  });

  it('puts the presets where they are dropped, and the list of the project in the same order', async () => {
    const [red, warm, white] = component.treeNodes;
    const amber = warm.children[0];
    const tree: TreeComponent = fixture.debugElement.query(By.directive(TreeComponent)).componentInstance;

    // white dragged into the folder, above amber, and the folder above red
    const dropped: TreeNode[] = [{ ...warm, children: [white, amber] }, red];
    tree.nodesChange.emit(dropped);
    await update();

    expect(preset('white').folderUuid).toBe('warm');
    expect(presetNames()).toEqual(['White', 'Amber', 'Red']);
    expect(rowNames()).toEqual(['Warm', 'White', 'Amber', 'Red']);
  });

  it('stops following the presets once it is gone', () => {
    fixture.destroy();

    project.presets.push(new Preset({ uuid: 'blue', name: 'Blue', sortIndex: 3 }));
    presetService.presetsChanged.next();

    expect(component.treeNodes.length).toBe(3);
  });
});
