import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../conformance/index';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { Project } from '../models/project';
import { InlineEditComponent } from '../inline-edit/inline-edit.component';
import { FixturePoolService } from '../services/fixture-pool.service';
import { FixtureService } from '../services/fixture.service';
import { IntroService } from '../services/intro.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { TreeComponent } from '../tree/tree.component';
import { FixtureComponent } from './fixture.component';

// The fixture panel: the fixtures of the project in their folders, checked for the selected
// preset (or for the settings). Their order is the one the presets chase in; a preset can
// bring an order of its own inside the same folders. The rig: two pars in the front folder,
// a pixel bar with two pixels and a moving head. "Warm" follows the project's order, "Chase"
// brings its own one.
describe('FixtureComponent', () => {
  let fixture: ComponentFixture<FixtureComponent>;
  let panel: FixtureComponent;
  let project: Project;
  let presetService: PresetService;
  let fixtureService: FixtureService;
  let previewLive: jasmine.Spy;
  let openPool: jasmine.Spy;
  let selectionChanged: number;

  beforeEach(() => {
    openPool = jasmine.createSpy('open');

    TestBed.configureTestingModule({
      declarations: [FixtureComponent, TreeComponent, InlineEditComponent],
      imports: [FormsModule, PopoverModule.forRoot(), TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        // the pool is a dialog of its own
        { provide: FixturePoolService, useValue: { open: openPool } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    });

    project = new Project({
      fixtureProfiles: ['test/rgb-par', 'chauvet-dj/colorband-pix', 'test/moving-head'].map((name) => ({
        ...JSON.parse(JSON.stringify(profiles[name])),
        uuid: name,
      })),
      fixtures: [
        { uuid: 'par-1', name: 'Par 1', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'par-2', name: 'Par 2', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 6 },
        {
          uuid: 'bar',
          name: 'Bar',
          profileUuid: 'chauvet-dj/colorband-pix',
          modeShortName: '6ch',
          dmxUniverseUuid: 'u',
          dmxFirstChannel: 12,
        },
        { uuid: 'head', name: 'Head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 18 },
      ],
      fixtureFolders: [{ uuid: 'front', name: 'Front', sortIndex: 0 }],
      presetFixtures: [
        { fixtureUuid: 'par-1', folderUuid: 'front', sortIndex: 0 },
        { fixtureUuid: 'par-2', folderUuid: 'front', sortIndex: 1 },
        { fixtureUuid: 'bar', pixelKey: '1/2', sortIndex: 1 },
        { fixtureUuid: 'bar', pixelKey: '2/2', sortIndex: 2 },
        { fixtureUuid: 'head', sortIndex: 3 },
      ],
      presets: [
        { uuid: 'warm', name: 'Warm', fixtures: [{ fixtureUuid: 'par-2' }, { fixtureUuid: 'bar', pixelKey: '1/2' }] },
        {
          uuid: 'chase',
          name: 'Chase',
          useGlobalFixtureOrder: false,
          fixtures: [
            { fixtureUuid: 'par-2', folderUuid: 'front', sortIndex: 0 },
            { fixtureUuid: 'par-1', folderUuid: 'front', sortIndex: 1 },
            { fixtureUuid: 'head', sortIndex: 0 },
          ],
          // the front folder comes after the head
          fixtureFolders: [{ folderUuid: 'front', sortIndex: 1 }],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset('warm');
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    selectionChanged = 0;
    presetService.fixtureSelectionChanged.subscribe(() => selectionChanged++);
  });

  async function open() {
    fixture = TestBed.createComponent(FixtureComponent);
    panel = fixture.componentInstance;
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function preset(uuid: string): Preset {
    return project.presets.find((candidate) => candidate.uuid === uuid);
  }

  const element = (): HTMLElement => fixture.nativeElement;
  const rows = (): HTMLElement[] => Array.from(element().querySelectorAll('.tree-node'));
  const names = (): string[] => rows().map((row) => row.textContent.trim());
  const row = (name: string): HTMLElement => rows().find((candidate) => candidate.textContent.trim() === name);
  const checked = (): string[] =>
    rows()
      .filter((candidate) => candidate.querySelector('input:checked'))
      .map((candidate) => candidate.textContent.trim());
  const keys = (presetFixtures: PresetFixture[]) =>
    presetFixtures.map((presetFixture) => presetFixture.fixtureUuid + (presetFixture.pixelKey ? ' ' + presetFixture.pixelKey : ''));
  const places = (presetFixtures: PresetFixture[]) =>
    presetFixtures.map((presetFixture) => [keys([presetFixture])[0], presetFixture.folderUuid, presetFixture.sortIndex]);

  // the buttons in the header of the panel, by their icon
  function button(icon: string): HTMLElement {
    return element().querySelector('.card-header .' + icon)?.parentElement;
  }

  async function click(target: HTMLElement) {
    target.click();
    await update();
  }

  // drag a row onto another one: at = how far down the row the cursor is
  async function dragAndDrop(from: string, to: string, at: number) {
    for (const [type, target] of [
      ['dragstart', row(from)],
      ['dragover', row(to)],
      ['drop', row(to)],
    ] as [string, HTMLElement][]) {
      const rect = target.getBoundingClientRect();
      const event = new DragEvent(type, { bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + rect.height * at });
      Object.defineProperty(event, 'dataTransfer', { value: { setData: () => {} } });
      target.dispatchEvent(event);
      fixture.detectChanges();
    }

    await update();
  }

  // can the row be dropped at the top of the other one?
  function dropsBefore(from: string, to: string): boolean {
    const start = new DragEvent('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'dataTransfer', { value: { setData: () => {} } });
    row(from).dispatchEvent(start);

    const rect = row(to).getBoundingClientRect();
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 1 });
    Object.defineProperty(over, 'dataTransfer', { value: {} });
    row(to).dispatchEvent(over);

    element()
      .querySelector('.tree')
      .dispatchEvent(new DragEvent('dragend', { bubbles: true }));

    return over.defaultPrevented;
  }

  describe('the fixtures of a preset', () => {
    it('shows the fixtures of the project in their folders, a pixel along with the name of its fixture', async () => {
      await open();

      expect(names()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
      expect(row('Par 1').querySelector('.tree-icon').classList).toContain('icon-color-changer');
      expect(row('Bar - 1/2').querySelector('.tree-icon').classList).toContain('icon-pixel-bar');
    });

    it('checks the fixtures the selected preset lights, and dims the others', async () => {
      await open();

      expect(checked()).toEqual(['Par 2', 'Bar - 1/2']);
      expect(row('Par 1').classList).toContain('inactive-list-item');
      expect(row('Par 2').classList).not.toContain('inactive-list-item');
    });

    it('lets the preset light a fixture with a click on its row, and no more with the next one', async () => {
      await open();

      await click(row('Par 1'));

      expect(keys(preset('warm').fixtures)).toEqual(['par-2', 'bar 1/2', 'par-1']);
      expect(checked()).toEqual(['Par 1', 'Par 2', 'Bar - 1/2']);
      // the click checks it, it does not select the row
      expect(row('Par 1').classList).not.toContain('selected');
      expect(row('Par 1').classList).toContain('focused');
      expect(selectionChanged).toBe(1);
      expect(previewLive).toHaveBeenCalled();

      await click(row('Par 1'));

      expect(keys(preset('warm').fixtures)).toEqual(['par-2', 'bar 1/2']);
    });

    it('lets the preset light a fixture with its checkbox', async () => {
      await open();

      await click(row('Head').querySelector('input'));

      expect(keys(preset('warm').fixtures)).toEqual(['par-2', 'bar 1/2', 'head']);
      // the click is the checkbox's, the row does not take it as well
      expect(row('Head').classList).not.toContain('focused');
    });

    it('lights all fixtures and pixels, or none', async () => {
      await open();

      await click(button('fa-check-square-o'));

      expect(keys(preset('warm').fixtures)).toEqual(['par-2', 'bar 1/2', 'par-1', 'bar 2/2', 'head']);
      expect(checked().length).toBe(5);

      await click(button('fa-square-o'));

      expect(preset('warm').fixtures).toEqual([]);
      expect(checked()).toEqual([]);
      expect(selectionChanged).toBe(2);
      expect(previewLive).toHaveBeenCalledTimes(2);
    });

    it('picks the fixtures to set up in the settings instead', async () => {
      fixtureService.settingsSelection = true;
      let settingsChanged = 0;
      presetService.fixtureSelectionSettingsChanged.subscribe(() => settingsChanged++);
      await open();

      expect(checked()).toEqual([]);
      expect(button('fa-list-ol')).toBeUndefined();

      await click(row('Head'));

      expect(fixtureService.selectedSettingsFixtures.map((candidate) => candidate.uuid)).toEqual(['head']);
      expect(checked()).toEqual(['Head']);
      expect(settingsChanged).toBe(1);
      expect(keys(preset('warm').fixtures)).toEqual(['par-2', 'bar 1/2']);

      await click(row('Head'));

      expect(fixtureService.selectedSettingsFixtures).toEqual([]);
    });

    it('follows the selection of another preset and a project loaded', async () => {
      await open();

      presetService.selectedPreset = preset('chase');
      presetService.previewSelectionChanged.next();
      await update();

      expect(checked()).toEqual(['Head', 'Par 2', 'Par 1']);

      project.presetFixtures.pop();
      TestBed.inject(ProjectService).projectChanged.next();
      await update();

      expect(names()).not.toContain('Head');
    });

    it('stops following the selection once it is gone', async () => {
      await open();
      const observers = presetService.previewSelectionChanged.observers.length;

      fixture.destroy();

      expect(presetService.previewSelectionChanged.observers.length).toBe(observers - 1);
    });
  });

  describe('the order the presets chase in', () => {
    it('lets a preset follow the order of the project, or bring its own one', async () => {
      await open();

      expect(button('fa-list-ol').classList).not.toContain('text-primary');

      await click(button('fa-list-ol'));

      expect(preset('warm').useGlobalFixtureOrder).toBe(false);
      expect(button('fa-list-ol').classList).toContain('text-primary');
      // it starts from the order it chased in so far, and the others come after its own
      expect(keys(preset('warm').fixtures)).toEqual(['par-2', 'bar 1/2']);
      expect(names()).toEqual(['Front', 'Par 2', 'Par 1', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
      expect(previewLive).toHaveBeenCalled();

      await click(button('fa-list-ol'));

      expect(preset('warm').useGlobalFixtureOrder).toBe(true);
      expect(names()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
    });

    it('offers no order of its own without a preset', async () => {
      presetService.selectedPreset = undefined;
      await open();

      expect(button('fa-list-ol')).toBeUndefined();

      panel.switchCustomFixtureOrder(true);
      await click(button('fa-check-square-o'));
      await click(row('Par 1'));

      expect(checked()).toEqual([]);
      expect(row('Par 1').classList).toContain('inactive-list-item');
      expect(row('Head').classList).toContain('inactive-list-item');
    });

    it('shows the order of a preset which brings its own one, its folders placed where it puts them', async () => {
      presetService.selectedPreset = preset('chase');
      await open();

      expect(names()).toEqual(['Head', 'Front', 'Par 2', 'Par 1', 'Bar - 1/2', 'Bar - 2/2']);
      // the fixtures it does not chase stay where they are
      expect(row('Bar - 1/2').getAttribute('draggable')).toBe('false');
      expect(row('Par 1').getAttribute('draggable')).toBe('true');
      expect(row('Front').getAttribute('draggable')).toBe('true');
    });

    it('moves a fixture within the order of the preset, the project keeps its own', async () => {
      presetService.selectedPreset = preset('chase');
      await open();
      const projectOrder = places(project.presetFixtures);

      await dragAndDrop('Par 1', 'Par 2', 0.1);

      expect(names()).toEqual(['Head', 'Front', 'Par 1', 'Par 2', 'Bar - 1/2', 'Bar - 2/2']);
      expect(places(preset('chase').fixtures)).toEqual([
        ['head', undefined, 0],
        ['par-1', 'front', 0],
        ['par-2', 'front', 1],
      ]);
      expect(places(project.presetFixtures)).toEqual(projectOrder);
      expect(previewLive).toHaveBeenCalled();
    });

    it('places a folder within the order of the preset, the project keeps it where it is', async () => {
      presetService.selectedPreset = preset('chase');
      await open();

      await dragAndDrop('Front', 'Head', 0.1);

      expect(names()).toEqual(['Front', 'Par 2', 'Par 1', 'Head', 'Bar - 1/2', 'Bar - 2/2']);
      expect(preset('chase').fixtureFolders.map((position) => [position.folderUuid, position.sortIndex])).toEqual([['front', 0]]);
      expect(places(preset('chase').fixtures)[2]).toEqual(['head', undefined, 1]);
      expect(project.fixtureFolders[0].sortIndex).toBe(0);
    });

    it('gives a folder the preset did not place yet a place of its own', async () => {
      presetService.selectedPreset = preset('chase');
      preset('chase').fixtureFolders = [];
      await open();

      expect(names()).toEqual(['Front', 'Par 2', 'Par 1', 'Head', 'Bar - 1/2', 'Bar - 2/2']);

      await dragAndDrop('Head', 'Front', 0.1);

      expect(names()).toEqual(['Head', 'Front', 'Par 2', 'Par 1', 'Bar - 1/2', 'Bar - 2/2']);
      expect(preset('chase').fixtureFolders.map((position) => [position.folderUuid, position.sortIndex])).toEqual([['front', 1]]);
    });

    it('keeps the fixtures of a preset in their folders, and in front of the ones it does not chase', async () => {
      presetService.selectedPreset = preset('chase');
      await open();

      // into another folder
      expect(dropsBefore('Head', 'Par 2')).toBe(false);
      expect(dropsBefore('Par 1', 'Head')).toBe(false);
      // next to a fixture it does not chase
      expect(dropsBefore('Head', 'Bar - 1/2')).toBe(false);
      // a folder into a folder
      expect(dropsBefore('Front', 'Par 2')).toBe(false);
      // among the rows it sits with
      expect(dropsBefore('Par 1', 'Par 2')).toBe(true);
      expect(dropsBefore('Head', 'Front')).toBe(true);
    });

    it('moves a fixture into another folder in the order of the project, and in the order of every preset with its own', async () => {
      await open();

      await dragAndDrop('Head', 'Front', 0.5);

      expect(names()).toEqual(['Front', 'Par 1', 'Par 2', 'Head', 'Bar - 1/2', 'Bar - 2/2']);
      expect(places(project.presetFixtures)).toEqual([
        ['par-1', 'front', 0],
        ['par-2', 'front', 1],
        ['head', 'front', 2],
        ['bar 1/2', undefined, 1],
        ['bar 2/2', undefined, 2],
      ]);
      // the chase follows it into the folder, at its end
      expect(places(preset('chase').fixtures)).toEqual([
        ['par-2', 'front', 0],
        ['par-1', 'front', 1],
        ['head', 'front', 2],
      ]);
      expect(previewLive).toHaveBeenCalled();
    });

    it('does not drop anything into a fixture, nor a folder into its own content', async () => {
      await open();
      await click(button('fa-folder-o'));
      const inner = project.fixtureFolders[1];
      inner.parentUuid = 'front';
      inner.name = 'Inner';
      TestBed.inject(ProjectService).projectChanged.next();
      await update();

      expect(names()).toEqual(['Front', 'Par 1', 'Par 2', 'Inner', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
      expect(panel.allowDrop([panel.treeNodes[0]], panel.treeNodes[0].children[2], 'inside')).toBe(false);
      expect(panel.allowDrop([panel.treeNodes[1]], panel.treeNodes[2], 'inside')).toBe(false);
      expect(panel.allowDrop([panel.treeNodes[1]], panel.treeNodes[0], 'inside')).toBe(true);
    });
  });

  describe('folders', () => {
    it('adds a folder at the end of the project, or of the folder of the fixture clicked last', async () => {
      await open();

      await click(button('fa-folder-o'));

      expect(names()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar - 1/2', 'Bar - 2/2', 'Head', 'designer.fixture.new-folder']);
      expect(row('designer.fixture.new-folder').classList).toContain('focused');
      expect(project.fixtureFolders[1].parentUuid).toBeUndefined();
      expect(project.fixtureFolders[1].sortIndex).toBe(4);

      await click(row('Par 2'));
      await click(button('fa-folder-o'));

      expect(names()).toEqual([
        'Front',
        'Par 1',
        'Par 2',
        'designer.fixture.new-folder',
        'Bar - 1/2',
        'Bar - 2/2',
        'Head',
        'designer.fixture.new-folder',
      ]);
      expect(project.fixtureFolders[2].parentUuid).toBe('front');
    });

    it('adds a folder next to the folder clicked last', async () => {
      await open();

      await click(row('Front'));

      expect(project.fixtureFolders[0].expanded).toBe(false);

      await click(button('fa-folder-o'));

      expect(names()).toEqual(['Front', 'Bar - 1/2', 'Bar - 2/2', 'Head', 'designer.fixture.new-folder']);
      expect(project.fixtureFolders[1].parentUuid).toBeUndefined();
    });

    it('removes the folder clicked last and keeps what was in it in its place, in the presets as well', async () => {
      await open();

      await click(button('fa-trash-o'));

      expect(project.fixtureFolders.length).toBe(1);

      await click(row('Front'));
      await click(button('fa-trash-o'));

      expect(names()).toEqual(['Par 1', 'Par 2', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
      expect(project.fixtureFolders).toEqual([]);
      expect(places(project.presetFixtures)).toEqual([
        ['par-1', undefined, 0],
        ['par-2', undefined, 1],
        ['bar 1/2', undefined, 2],
        ['bar 2/2', undefined, 3],
        ['head', undefined, 4],
      ]);
      // the chase does not place the folder anymore, its fixtures are out of it
      expect(preset('chase').fixtureFolders).toEqual([]);
      expect(preset('chase').fixtures.every((presetFixture) => presetFixture.folderUuid === undefined)).toBe(true);
      expect(previewLive).toHaveBeenCalled();
    });

    it('closes all folders and opens them again', async () => {
      await open();

      await click(element().querySelector('.card-header .fa-compress').parentElement);

      expect(names()).toEqual(['Front', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
      expect(project.fixtureFolders[0].expanded).toBe(false);
      expect(element().querySelector('.card-header .fa-expand')).not.toBeNull();

      await click(element().querySelector('.card-header .fa-expand').parentElement);

      expect(names()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar - 1/2', 'Bar - 2/2', 'Head']);
    });

    it('renames a folder in place', async () => {
      await open();

      await click(row('Front').querySelector('.inline-edit-value'));
      const input: HTMLInputElement = element().querySelector('.tree-node input.inline-edit-input');
      input.value = 'Truss';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await update();

      expect(project.fixtureFolders[0].name).toBe('Truss');
      expect(project.fixtureFolders[0].expanded).toBe(true);
    });
  });

  describe('the fixture pool', () => {
    it('opens the fixture pool', async () => {
      await open();

      await click(button('fa-cog'));

      expect(openPool).toHaveBeenCalled();
      expect(element().querySelector('.fa-plus-circle')).toBeNull();
    });

    it('offers to add fixtures in the fixture pool, while there are none', async () => {
      project.presetFixtures = [];
      await open();

      await click(element().querySelector('.fa-plus-circle').parentElement);

      expect(openPool).toHaveBeenCalled();
    });

    it('stands out while the introduction explains it', async () => {
      const introService = TestBed.inject(IntroService);
      introService.showIntro = true;
      introService.activeStep = 'fixtures';
      await open();

      expect(element().querySelector('.card').classList).toContain('card-intro-active');
    });
  });
});
