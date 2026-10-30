import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';

import { profiles } from '../../../conformance/index';
import { Fixture } from '../models/fixture';
import { FixtureProfile } from '../models/fixture-profile';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { InlineEditComponent } from '../inline-edit/inline-edit.component';
import { ConfigService } from '../services/config.service';
import { FixtureOrderService } from '../services/fixture-order.service';
import { FixtureExchangeService } from '../services/fixture-exchange.service';
import { FixtureService } from '../services/fixture.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { TreeComponent, TreeNode } from '../tree/tree.component';
import { FixturePoolCreateFromFileComponent } from './fixture-pool-create-from-file/fixture-pool-create-from-file.component';
import { FixturePoolEditUniversesComponent } from './fixture-pool-edit-universes/fixture-pool-edit-universes.component';
import { FixturePoolComponent } from './fixture-pool.component';

// The fixture pool patches the fixtures of the project: which profiles they are, in which
// folder, universe, mode and on which channels. It works on a copy, the project only takes
// it on OK. The rig: two pars in the front folder and a pixel bar on the stage universe, a
// moving head and a second pixel bar (in another mode) on the floor.
describe('FixturePoolComponent', () => {
  let fixture: ComponentFixture<FixturePoolComponent>;
  let pool: FixturePoolComponent;
  let project: Project;
  let http: HttpTestingController;
  let config: ConfigService;
  let fixtureService: FixtureService;
  let hide: jasmine.Spy;
  let show: jasmine.Spy;
  let previewLive: jasmine.Spy;
  let error: jasmine.Spy;
  let success: jasmine.Spy;
  let dialog: { onClose: Subject<any> };
  let modalsCount: number;
  let closed: number[];

  // the library as the search lists it: only the metadata of a profile
  const library = [
    { uuid: 'test/rgb-par', name: 'RGB par', manufacturerName: 'Test', categories: ['Color Changer'] },
    { uuid: 'chauvet-dj/colorband-pix', name: 'COLORband PiX', manufacturerName: 'Chauvet DJ', categories: ['Pixel Bar'] },
    { uuid: 'test/rgb', name: 'RGB par without dimmer', manufacturerName: 'Test', categories: ['Color Changer'] },
    { uuid: 'test/moving-head', name: 'Moving head', manufacturerName: 'Test', categories: ['Moving Head'] },
  ];

  function profile(name: string): any {
    return { ...JSON.parse(JSON.stringify(profiles[name])), uuid: name };
  }

  beforeEach(() => {
    hide = jasmine.createSpy('hide');
    modalsCount = 1;
    dialog = { onClose: new Subject() };
    show = jasmine.createSpy('show').and.callFake(() => ({ content: dialog }));

    TestBed.configureTestingModule({
      declarations: [FixturePoolComponent, TreeComponent, InlineEditComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: BsModalService, useValue: { show, getModalsCount: () => modalsCount } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    });

    project = new Project({
      fixtureProfiles: [profile('test/rgb-par'), profile('chauvet-dj/colorband-pix'), profile('test/moving-head')],
      fixtures: [
        { uuid: 'par-1', name: 'Par 1', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'stage', dmxFirstChannel: 0 },
        { uuid: 'par-2', name: 'Par 2', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'stage', dmxFirstChannel: 6 },
        // two pixels of three channels
        {
          uuid: 'bar',
          name: 'Bar',
          profileUuid: 'chauvet-dj/colorband-pix',
          modeShortName: '6ch',
          dmxUniverseUuid: 'stage',
          dmxFirstChannel: 12,
        },
        { uuid: 'head', name: 'Head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'floor', dmxFirstChannel: 0 },
        // the whole bar on three channels
        {
          uuid: 'bar-2',
          name: 'Bar 2',
          profileUuid: 'chauvet-dj/colorband-pix',
          modeShortName: '3ch',
          dmxUniverseUuid: 'floor',
          dmxFirstChannel: 6,
        },
      ],
      fixtureFolders: [{ uuid: 'front', name: 'Front', sortIndex: 0 }],
      presetFixtures: [
        { fixtureUuid: 'par-1', folderUuid: 'front', sortIndex: 0 },
        { fixtureUuid: 'par-2', folderUuid: 'front', sortIndex: 1 },
        { fixtureUuid: 'bar', pixelKey: '1/2', sortIndex: 1 },
        { fixtureUuid: 'bar', pixelKey: '2/2', sortIndex: 2 },
        { fixtureUuid: 'head', sortIndex: 3 },
        { fixtureUuid: 'bar-2', sortIndex: 4 },
      ],
      presets: [{ uuid: 'warm', name: 'Warm', fixtures: [{ fixtureUuid: 'par-2' }, { fixtureUuid: 'bar', pixelKey: '1/2' }] }],
    });
    TestBed.inject(ProjectService).project = project;

    config = TestBed.inject(ConfigService);
    config.universes = [
      { uuid: 'stage', name: 'Stage' },
      { uuid: 'floor', name: 'Floor' },
    ];

    fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    http = TestBed.inject(HttpTestingController);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    error = spyOn(TestBed.inject(ToastrService), 'error');
    success = spyOn(TestBed.inject(ToastrService), 'success');
    closed = [];
  });

  afterEach(() => {
    http.verify();
  });

  async function open(searchProfiles: any[] = library) {
    fixture = TestBed.createComponent(FixturePoolComponent);
    pool = fixture.componentInstance;
    pool.onClose.subscribe((result) => closed.push(result));

    // the channel map lays out 20 channels on a row
    fixture.nativeElement.style.display = 'block';
    fixture.nativeElement.style.width = '560px';

    fixture.detectChanges();
    http.expectOne('fixtures').flush(searchProfiles);
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const element = (): HTMLElement => fixture.nativeElement;
  const treeRows = (): HTMLElement[] => Array.from(element().querySelectorAll('.tree-node'));
  const treeNames = (): string[] => treeRows().map((row) => row.textContent.trim());
  const treeRow = (name: string): HTMLElement => treeRows().find((row) => row.textContent.trim() === name);
  const profileRows = (): string[] =>
    Array.from(element().querySelectorAll('.list-group-flush > .list-group-item')).map((row: HTMLElement) =>
      row.textContent.replace(/\s+/g, ' ').trim()
    );
  const selects = (): HTMLSelectElement[] => Array.from(element().querySelectorAll('select'));
  const folderButtons = (): HTMLElement[] => Array.from(element().querySelectorAll('.fixtures-card .card-header a'));
  const poolFixture = (uuid: string) => pool.fixturePool.find((candidate) => candidate.uuid === uuid);
  const rows = () =>
    project.presetFixtures.map((presetFixture) => [
      presetFixture.fixtureUuid + (presetFixture.pixelKey ? ' ' + presetFixture.pixelKey : ''),
      presetFixture.folderUuid,
      presetFixture.sortIndex,
    ]);

  async function choose(select: HTMLSelectElement, text: string) {
    select.value = Array.from(select.options).find((option) => option.textContent.trim().startsWith(text)).value;
    select.dispatchEvent(new Event('change'));
    await update();
  }

  async function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await update();
  }

  async function click(target: HTMLElement) {
    target.click();
    await update();
  }

  // the channels of the map which are taken, by the first channel of each run
  function occupied(): string[] {
    const runs: string[] = [];
    let start = -1;

    pool.dmxChannels.forEach((channel, index) => {
      if (channel.occupied && start < 0) {
        start = index;
      }
      if (start >= 0 && (!channel.occupied || channel.end)) {
        runs.push(start + '-' + (channel.occupied ? index : index - 1));
        start = -1;
      }
    });

    return runs;
  }

  function flags(name: 'selected' | 'overlapped'): number[] {
    return pool.dmxChannels.map((channel, index) => (channel[name] ? index : -1)).filter((index) => index >= 0);
  }

  describe('the fixture tree', () => {
    it('shows the fixtures of the project in the folders of the fixture panel, a bar with its pixels on one row', async () => {
      await open();

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2']);
      expect(treeRow('Par 1').querySelector('.tree-icon').classList).toContain('icon-color-changer');
      expect(treeRow('Front').querySelector('.tree-icon').classList).toContain('fa-folder-open-o');
    });

    it('puts a fixture which has no row in the fixture panel last', async () => {
      project.fixtures.push(new Fixture({ ...project.fixtures[0], uuid: 'spare', name: 'Spare', dmxFirstChannel: 30 }));

      await open();

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2', 'Spare']);
    });

    it('edits the first fixture of the first universe, and marks it', async () => {
      await open();

      expect(pool.selectedFixture.uuid).toBe('par-1');
      expect(treeRow('Par 1').classList).toContain('selected');
      expect(treeRow('Par 1').classList).toContain('focused');
      expect((element().querySelector('#fixtureName') as HTMLInputElement).value).toBe('Par 1');
    });

    it('edits the fixture clicked in the tree', async () => {
      await open();

      await click(treeRow('Bar'));

      expect(pool.selectedFixture.uuid).toBe('bar');
      expect(treeRow('Bar').classList).toContain('selected');
      expect(treeRow('Par 1').classList).not.toContain('selected');
      expect(selects()[1].selectedOptions[0].textContent).toContain('6-channel');
    });

    it('keeps several rows selected to drag them together', async () => {
      await open();

      await click(treeRow('Par 1'));
      treeRow('Bar').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      await update();

      expect(treeRow('Par 1').classList).toContain('selected');
      expect(treeRow('Bar').classList).toContain('selected');

      // also when the tree is built again
      await click(folderButtons()[2]);

      expect(treeRow('Par 1').classList).toContain('selected');
      expect(treeRow('Bar').classList).toContain('selected');
    });

    it('lets nothing go into a fixture, and no folder into its own content', async () => {
      await open();

      const front = pool.treeNodes[0];
      const bar = pool.treeNodes[1];

      expect(pool.allowDrop([front.children[0]], bar, 'inside')).toBe(false);
      expect(pool.allowDrop([front.children[0]], bar, 'after')).toBe(true);
      expect(pool.allowDrop([bar], front, 'inside')).toBe(true);
      expect(pool.allowDrop([front], front.children[1], 'before')).toBe(false);
      expect(pool.allowDrop([front], bar, 'before')).toBe(true);
    });
  });

  describe('the universes', () => {
    it('dims the fixtures which are not in the universe shown, and shows the universe of a fixture clicked', async () => {
      await open();

      expect(selects()[0].selectedOptions[0].textContent.trim()).toBe('Stage');
      expect(treeRow('Head').classList).toContain('inactive-list-item');
      expect(treeRow('Bar 2').classList).toContain('inactive-list-item');
      expect(treeRow('Par 1').classList).not.toContain('inactive-list-item');

      await click(treeRow('Head'));

      expect(pool.selectedUniverse.uuid).toBe('floor');
      expect(selects()[0].selectedOptions[0].textContent.trim()).toBe('Floor');
      expect(treeRow('Par 1').classList).toContain('inactive-list-item');
      expect(treeRow('Head').classList).not.toContain('inactive-list-item');
      expect(occupied()).toEqual(['0-5', '6-8']);
    });

    it('edits the first fixture of a universe chosen, unless the one edited is in it', async () => {
      await open();

      await choose(selects()[0], 'Floor');

      expect(pool.selectedFixture.uuid).toBe('head');
      expect(occupied()).toEqual(['0-5', '6-8']);

      pool.selectUniverse(pool.universes[1]);

      expect(pool.selectedFixture.uuid).toBe('head');
    });

    it('shows all fixtures together, when there are no universes', async () => {
      config.universes = [];
      await open();

      expect(selects()[0].disabled).toBe(true);
      expect(pool.currentUniverseFixtures.length).toBe(5);
      expect(treeRows().some((row) => row.classList.contains('inactive-list-item'))).toBe(false);
      expect(pool.selectedFixture.uuid).toBe('par-1');
      expect(element().querySelector('.input-group-append')).toBeNull();
    });

    it('brings a first universe along, where the user names the universes', async () => {
      config.universes = [];
      config.freeUniverseEdit = true;
      await open();

      expect(pool.universes.map((universe) => universe.name)).toEqual(['Universe 1']);
      expect(pool.selectedUniverse).toBe(pool.universes[0]);
      expect(element().querySelector('.input-group-append button')).not.toBeNull();

      pool.ok();

      // the designer keeps them, as nobody else has a list of them
      expect(config.universes).toBe(pool.universes);
    });

    it('opens the universes to be edited on a copy, and takes the ones edited', async () => {
      config.freeUniverseEdit = true;
      await open();

      await click(element().querySelector('.input-group-append button'));

      expect(show).toHaveBeenCalled();
      expect(show.calls.mostRecent().args[0]).toBe(FixturePoolEditUniversesComponent);

      const handedOver = show.calls.mostRecent().args[1].initialState.universes;
      expect(handedOver).toEqual(pool.universes);
      expect(handedOver[0]).not.toBe(pool.universes[0]);

      // renamed the stage, removed the floor and added the back
      dialog.onClose.next([
        { uuid: 'stage', name: 'Main stage' },
        { uuid: 'back', name: 'Back' },
      ]);
      await update();

      expect(pool.selectedUniverse.name).toBe('Main stage');
      expect(selects()[0].selectedOptions[0].textContent.trim()).toBe('Main stage');
      // the fixtures of the floor are in no universe anymore
      expect(poolFixture('head').dmxUniverseUuid).toBeUndefined();
      expect(poolFixture('bar-2').dmxUniverseUuid).toBeUndefined();
      expect(poolFixture('par-1').dmxUniverseUuid).toBe('stage');
      // the project only takes them on OK
      expect(project.fixtures[3].dmxUniverseUuid).toBe('floor');
    });

    it('shows the first universe left, when the one shown was removed', async () => {
      config.freeUniverseEdit = true;
      await open();
      await click(treeRow('Head'));

      pool.openEditUniverses();
      dialog.onClose.next([{ uuid: 'stage', name: 'Stage' }]);
      await update();

      expect(pool.selectedUniverse.uuid).toBe('stage');
      expect(pool.selectedFixture.uuid).toBe('par-1');
    });

    it('keeps the universes, when their editing is cancelled', async () => {
      config.freeUniverseEdit = true;
      await open();
      const universes = pool.universes;

      pool.openEditUniverses();
      dialog.onClose.next(undefined);

      expect(pool.universes).toBe(universes);
      expect(poolFixture('head').dmxUniverseUuid).toBe('floor');
    });
  });

  describe('the profiles', () => {
    it('lists the profiles of the library in their order, while it shows a spinner until they are there', async () => {
      fixture = TestBed.createComponent(FixturePoolComponent);
      pool = fixture.componentInstance;
      fixture.detectChanges();

      expect(element().querySelector('.list-group-flush .fa-spinner')).not.toBeNull();

      http.expectOne('fixtures').flush(library);
      await update();

      expect(element().querySelector('.list-group-flush .fa-spinner')).toBeNull();
      expect(profileRows()).toEqual([
        'Chauvet DJ - COLORband PiX',
        'Test - Moving head',
        'Test - RGB par without dimmer',
        'Test - RGB par',
      ]);
      expect(element().querySelector('.list-group-flush .icon-pixel-bar')).not.toBeNull();
    });

    it('finds the profiles which match all words searched for, in their name, manufacturer or key', async () => {
      await open();
      const search: HTMLInputElement = element().querySelector('#searchSet');

      await type(search, 'test  rgb');

      expect(profileRows()).toEqual(['Test - RGB par without dimmer', 'Test - RGB par']);

      await type(search, 'chauvet-dj/');

      expect(profileRows()).toEqual(['Chauvet DJ - COLORband PiX']);

      await type(search, 'MOVING');

      expect(profileRows()).toEqual(['Test - Moving head']);

      await type(search, '');

      expect(profileRows().length).toBe(4);
    });

    it('shows the first matches of a wide search and says how many more there are', async () => {
      const many = [];
      for (let i = 0; i < 60; i++) {
        many.push({ uuid: 'maker/par-' + (100 + i), name: 'Par ' + i, manufacturerName: 'Maker', categories: [] });
      }

      await open(many);

      expect(pool.filteredProfiles.length).toBe(50);
      expect(pool.hiddenProfileCount).toBe(10);
      expect(profileRows().length).toBe(51);
      expect(profileRows()[50]).toBe('designer.fixture-pool.more-profiles');
    });

    it('updates the profiles of a designer which keeps them itself', async () => {
      config.localProfiles = true;
      await open();
      const button: HTMLButtonElement = element().querySelector('button.btn-sm');

      await click(button);

      expect(button.disabled).toBe(true);
      expect(button.querySelector('.fa-spinner')).not.toBeNull();

      http.expectOne('update-profiles').flush({});
      http.expectOne('fixtures').flush(library.slice(0, 1));
      await update();

      expect(button.disabled).toBe(false);
      expect(button.querySelector('.fa-download')).not.toBeNull();
      expect(profileRows()).toEqual(['Test - RGB par']);
      expect(success).toHaveBeenCalledWith('designer.fixture-pool.profiles-updated', 'designer.fixture-pool.profiles-updated-title');
    });

    it('says so, when the profiles could not be updated', async () => {
      config.localProfiles = true;
      await open();

      pool.updateProfiles();
      http.expectOne('update-profiles').flush('', { status: 500, statusText: 'Server Error' });
      await update();

      expect(pool.updatingProfiles).toBe(false);
      expect(error).toHaveBeenCalledWith(
        'designer.fixture-pool.profiles-update-error',
        'designer.fixture-pool.profiles-update-error-title'
      );
      expect(success).not.toHaveBeenCalled();
    });
  });

  describe('adding and removing fixtures', () => {
    it('adds a fixture of a profile from the library on the next free channels, next to the one edited', async () => {
      await open();
      await type(element().querySelector('#searchSet'), 'rgb');

      await click(element().querySelectorAll('.list-group-flush .btn-primary')[0] as HTMLElement);

      http.expectOne('fixtures?uuid=test/rgb').flush([library[2]]);
      http.expectOne('fixture?uuid=test/rgb').flush(profiles['test/rgb']);
      await update();

      const added = pool.selectedFixture;

      expect(added.name).toBe('RGB par without dimmer');
      expect(added.profileUuid).toBe('test/rgb');
      expect(added.modeShortName).toBe('4ch');
      expect(added.dmxUniverseUuid).toBe('stage');
      expect(added.dmxFirstChannel).toBe(18);
      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'RGB par without dimmer', 'Bar', 'Head', 'Bar 2']);
      expect(treeRow('RGB par without dimmer').classList).toContain('selected');
      expect(occupied()).toEqual(['0-5', '6-11', '12-17', '18-21']);
      expect(flags('selected')).toEqual([18, 19, 20, 21]);
      // the profile is in the project from now on
      expect(fixtureService.getProfileByUuid('test/rgb').manufacturerName).toBe('Test');
    });

    it('adds a fixture of a profile in the project without loading it again, into the folder clicked last', async () => {
      await open();
      await click(treeRow('Head'));
      // clicking a folder opens and closes it, the second click opens it again
      await click(treeRow('Front'));
      await click(treeRow('Front'));

      pool.addFixture(new FixtureProfile(library[0]));
      await update();

      // the same mode as the other fixtures of the profile, on the universe shown
      expect(pool.selectedFixture.modeShortName).toBe('6ch');
      expect(pool.selectedFixture.dmxUniverseUuid).toBe('floor');
      expect(pool.selectedFixture.dmxFirstChannel).toBe(9);
      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'RGB par', 'Bar', 'Head', 'Bar 2']);
    });

    it('says so, when the universe has no room for another fixture', async () => {
      // the stage is full up to its last two channels
      for (let i = 0; i < 82; i++) {
        project.fixtures.push(new Fixture({ ...project.fixtures[0], uuid: 'par-' + (100 + i), dmxFirstChannel: 18 + i * 6 }));
      }
      await open();

      pool.addFixture(new FixtureProfile(library[0]));
      await update();

      expect(error).toHaveBeenCalledWith('designer.fixture-pool.no-free-space', 'designer.fixture-pool.no-free-space-title');
      expect(pool.fixturePool.length).toBe(87);
      expect(pool.selectedFixture.uuid).toBe('par-1');
    });

    it('adds a copy of the fixture edited on the same channels, next to it', async () => {
      await open();
      await click(treeRow('Par 2'));

      await click(element().querySelector('#settings button.btn-primary'));

      const copy = pool.selectedFixture;

      expect(copy.uuid).not.toBe('par-2');
      expect(copy.name).toBe('Par 2');
      expect(copy.profileUuid).toBe('test/rgb-par');
      expect(copy.modeShortName).toBe('6ch');
      expect(copy.dmxFirstChannel).toBe(6);
      expect(copy.dmxUniverseUuid).toBe('stage');
      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Par 2', 'Bar', 'Head', 'Bar 2']);
      // the same lamp patched twice does not collide
      expect(flags('overlapped')).toEqual([]);
    });

    it('removes a fixture with the button on its row, and edits the first one of the universe instead', async () => {
      await open();

      await click(treeRow('Par 2').querySelector('.fixture-remove'));

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Bar', 'Head', 'Bar 2']);
      expect(pool.selectedFixture.uuid).toBe('par-1');
      expect(occupied()).toEqual(['0-5', '12-17']);

      await click(treeRow('Par 1').querySelector('.fixture-remove'));

      expect(pool.selectedFixture.uuid).toBe('bar');
      expect(treeRow('Bar').classList).toContain('selected');

      // the project only loses them on OK
      expect(project.fixtures.length).toBe(5);
    });

    it('edits no fixture, when the last one of the universe is removed', async () => {
      config.universes = [{ uuid: 'floor', name: 'Floor' }];
      project.fixtures = project.fixtures.filter((candidate) => candidate.uuid === 'head');
      await open();

      pool.removeFixture(pool.selectedFixture);
      await update();

      expect(pool.selectedFixture).toBeUndefined();
      expect(element().querySelector('#fixtureName')).toBeNull();
    });

    it('keeps the profiles of the project, when the fixture pool is cancelled', async () => {
      await open();

      pool.removeFixture(poolFixture('head'));
      pool.cancel();

      expect(project.fixtures.map((candidate) => candidate.uuid)).toContain('head');
      expect(fixtureService.getProfileByUuid('test/moving-head')).toBeDefined();
    });

    it('takes the profiles no fixture uses anymore out of the project on OK', async () => {
      await open();

      pool.removeFixture(poolFixture('head'));
      pool.removeFixture(poolFixture('bar'));
      pool.ok();

      expect(project.fixtureProfiles.map((candidate) => candidate.uuid)).toEqual(['test/rgb-par', 'chauvet-dj/colorband-pix']);

      const second = TestBed.createComponent(FixturePoolComponent);
      second.detectChanges();
      http.expectOne('fixtures').flush(library);
      pool = second.componentInstance;
      pool.removeFixture(poolFixture('bar-2'));
      pool.removeFixture(poolFixture('par-1'));
      pool.removeFixture(poolFixture('par-2'));
      pool.ok();

      expect(project.fixtureProfiles).toEqual([]);
    });

    it('adds a fixture from a profile file into the folder of the fixture edited', async () => {
      await open();

      await click(element().querySelector('.col-6 > .row button.btn-secondary'));

      expect(show.calls.mostRecent().args[0]).toBe(FixturePoolCreateFromFileComponent);

      const fromFile = profile('test/rgb');
      fromFile.uuid = 'acme/rgb';
      fromFile.name = 'Acme RGB';
      project.fixtureProfiles.push(new FixtureProfile(fromFile));

      dialog.onClose.next(fixtureService.getProfileByUuid('acme/rgb'));
      await update();

      expect(pool.selectedFixture.name).toBe('Acme RGB');
      expect(pool.selectedFixture.dmxUniverseUuid).toBe('stage');
      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Acme RGB', 'Bar', 'Head', 'Bar 2']);
    });

    it('adds nothing, when the profile file dialog is closed without a file', fakeAsync(() => {
      fixture = TestBed.createComponent(FixturePoolComponent);
      pool = fixture.componentInstance;
      fixture.detectChanges();
      http.expectOne('fixtures').flush(library);

      pool.createFixtureFromProfileFile();
      dialog.onClose.next(undefined);
      flush();

      expect(pool.fixturePool.length).toBe(5);
      expect(pool.selectedFixture.uuid).toBe('par-1');
    }));
  });

  describe('the channel map', () => {
    it('marks the channels the fixtures of the universe take, the ones of the fixture edited and the ones two fixtures collide on', async () => {
      await open();

      expect(occupied()).toEqual(['0-5', '6-11', '12-17']);
      expect(flags('selected')).toEqual([0, 1, 2, 3, 4, 5]);
      expect(flags('overlapped')).toEqual([]);
      expect(pool.dmxChannels[6].start).toBe(true);
      expect(pool.dmxChannels[11].end).toBe(true);

      await click(treeRow('Par 2'));
      await type(element().querySelector('input[type=number]'), '4');

      expect(poolFixture('par-2').dmxFirstChannel).toBe(3);
      expect(flags('overlapped')).toEqual([3, 4, 5]);
      expect(flags('selected')).toEqual([3, 4, 5, 6, 7, 8]);
    });

    it('keeps the address typed in on the map', async () => {
      await open();
      const input: HTMLInputElement = element().querySelector('input[type=number]');

      expect(input.value).toBe('1');

      await type(input, '0');
      expect(pool.selectedFixture.dmxFirstChannel).toBe(0);

      await type(input, '600');
      expect(pool.selectedFixture.dmxFirstChannel).toBe(511);

      await type(input, '100.4');
      expect(pool.selectedFixture.dmxFirstChannel).toBe(99);
    });

    it('draws the channels on the map, in the colours of the stylesheet', async () => {
      await open();

      const map: HTMLElement = element().querySelector('.dmx-map');
      map.style.setProperty('--dmx-fill', 'rgb(0, 0, 255)');
      map.style.setProperty('--dmx-selected-fill', 'rgb(0, 255, 0)');
      map.style.setProperty('--dmx-overlap-fill', 'rgb(255, 0, 0)');
      map.style.setProperty('--dmx-line', 'rgb(128, 128, 128)');
      map.style.setProperty('--dmx-edge', 'rgb(0, 0, 128)');
      map.style.setProperty('--dmx-overlap-edge', 'rgb(128, 0, 0)');

      poolFixture('bar').dmxFirstChannel = 16;
      pool.updateChannelMap();

      const canvas: HTMLCanvasElement = element().querySelector('canvas');
      const ratio = window.devicePixelRatio || 1;
      const context = canvas.getContext('2d');

      // the middle of a channel: 20 channels of 28 x 20 px on a row
      const colour = (channel: number) =>
        Array.from(
          context.getImageData(
            Math.floor(((channel % 20) * 28 + 14) * ratio),
            Math.floor((Math.floor(channel / 20) * 20 + 10) * ratio),
            1,
            1
          ).data
        ).join(',');

      expect(canvas.style.width).toBe('560px');
      expect(canvas.style.height).toBe(26 * 20 + 'px');

      expect(colour(0)).toBe('0,255,0,255');
      expect(colour(6)).toBe('0,0,255,255');
      // the bar wraps onto the next row
      expect(colour(19)).toBe('0,0,255,255');
      expect(colour(20)).toBe('0,0,255,255');
      expect(colour(30)).toBe('0,0,0,0');

      poolFixture('par-2').dmxFirstChannel = 3;
      pool.updateChannelMap();

      expect(colour(4)).toBe('255,0,0,255');
      expect(colour(1)).toBe('0,255,0,255');
      expect(colour(7)).toBe('0,0,255,255');
    });

    it('lays the map out over the width it is given, without the browser complaining about it', async () => {
      const errors: string[] = [];
      const listener = (event: ErrorEvent) => errors.push(event.message);
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

      window.addEventListener('error', listener);
      await open();
      await frame();
      await frame();
      await frame();
      window.removeEventListener('error', listener);

      expect(errors).toEqual([]);
      expect(element().querySelector('canvas').style.width).toBe('560px');
    });

    it('shows the number of the channel under the cursor', async () => {
      await open();
      const map: HTMLElement = element().querySelector('.dmx-map');
      const label: HTMLElement = element().querySelector('.dmx-channel-label');

      pool.updateChannelMap();
      move(map, 'mousemove', 45);

      expect(label.hidden).toBe(false);
      expect(label.textContent).toBe('46');
      expect(label.style.left).toBe(5.5 * 28 + 'px');
      expect(label.style.top).toBe('40px');

      // right of the last channel of a row there is none
      move(map, 'mousemove', 20.9 * 28, 0, true);

      expect(label.hidden).toBe(true);

      move(map, 'mousemove', 1);
      map.dispatchEvent(new MouseEvent('mouseleave'));

      expect(label.hidden).toBe(true);
    });

    it('moves a fixture dragged across the map, as far as it fits', async () => {
      await open();
      const map: HTMLElement = element().querySelector('.dmx-map');
      pool.updateChannelMap();

      // grab the bar at its second channel
      move(map, 'mousedown', 13);
      await update();

      expect(pool.selectedFixture.uuid).toBe('bar');

      move(map, 'mousemove', 41);
      await update();

      expect(poolFixture('bar').dmxFirstChannel).toBe(40);
      expect(occupied()).toEqual(['0-5', '6-11', '40-45']);

      // it stays on the map
      move(map, 'mousemove', 0);
      move(map, 'mousemove', 511);

      expect(poolFixture('bar').dmxFirstChannel).toBe(40);

      window.dispatchEvent(new MouseEvent('mouseup'));
      move(map, 'mousemove', 101);

      expect(poolFixture('bar').dmxFirstChannel).toBe(40);
    });

    it('keeps the fixture edited, when the channel grabbed is shared with another one', async () => {
      await open();
      const map: HTMLElement = element().querySelector('.dmx-map');
      pool.updateChannelMap();

      await click(treeRow('Par 2'));
      poolFixture('par-2').dmxFirstChannel = 3;
      pool.updateChannelMap();

      move(map, 'mousedown', 4);

      expect(pool.selectedFixture.uuid).toBe('par-2');

      window.dispatchEvent(new MouseEvent('mouseup'));
      await click(treeRow('Par 1'));
      move(map, 'mousedown', 4);

      expect(pool.selectedFixture.uuid).toBe('par-1');

      // a channel nobody is on grabs nothing
      window.dispatchEvent(new MouseEvent('mouseup'));
      move(map, 'mousedown', 300);

      expect(pool.channelDragFixture).toBeUndefined();
      expect(pool.selectedFixture.uuid).toBe('par-1');

      move(map, 'mousedown', 21 * 28, 0, true);

      expect(pool.channelDragFixture).toBeUndefined();
    });

    it('stops following the cursor once it is closed', async () => {
      await open();
      const map: HTMLElement = element().querySelector('.dmx-map');
      const label: HTMLElement = element().querySelector('.dmx-channel-label');
      pool.updateChannelMap();

      fixture.destroy();
      move(map, 'mousemove', 45);

      expect(label.hidden).toBe(true);
    });

    // a mouse event on the map, at the middle of a channel (or at a raw position in px)
    function move(map: HTMLElement, type: string, channel: number, y = 0, raw = false) {
      const rect = map.getBoundingClientRect();
      const x = raw ? channel : (channel % 20) * 28 + 14;
      const top = raw ? y + 10 : Math.floor(channel / 20) * 20 + 10;

      map.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: rect.left + x, clientY: rect.top + top }));
    }
  });

  describe('the settings of a fixture', () => {
    it('renames the fixture edited', async () => {
      await open();

      await type(element().querySelector('#fixtureName'), 'Left par');

      expect(poolFixture('par-1').name).toBe('Left par');
      expect(treeNames()[1]).toBe('Left par');
      expect(project.fixtures[0].name).toBe('Par 1');
    });

    it('switches the mode of the fixture edited, which takes the channels of it', async () => {
      await open();
      await click(treeRow('Bar'));

      expect(Array.from(selects()[1].options).map((option) => option.textContent.replace(/\s+/g, ' ').trim())[1]).toBe(
        '3-channel - 3 designer.fixture-pool.channels'
      );

      await choose(selects()[1], '3-channel');

      expect(poolFixture('bar').modeShortName).toBe('3ch');
      expect(occupied()).toEqual(['0-5', '6-11', '12-14']);
    });

    it('moves the fixture edited into another universe', async () => {
      await open();
      await click(treeRow('Bar'));

      await choose(selects()[2], 'Floor');

      expect(poolFixture('bar').dmxUniverseUuid).toBe('floor');
      expect(occupied()).toEqual(['0-5', '6-11']);
      expect(treeRow('Bar').classList).toContain('inactive-list-item');
    });
  });

  // The pars of the venue are another model than the ones the show was written for: the fixtures selected become
  // fixtures of the profile picked, and what the presets set for the old model goes over to the new one on OK
  describe('changing fixtures to another model', () => {
    // the button changing the fixtures to the profile of the row, e.g. "Test - RGB par"
    const exchangeButton = (rowText: string): HTMLElement =>
      (Array.from(element().querySelectorAll('.list-group-flush > .list-group-item')) as HTMLElement[])
        .find((row) => row.textContent.replace(/\s+/g, ' ').trim() === rowText)
        .querySelector('.profile-exchange');

    async function exchangeTo(rowText: string) {
      await click(exchangeButton(rowText));
    }

    async function loadProfile(name: string, searchProfile: any) {
      http.expectOne('fixtures?uuid=' + name).flush([searchProfile]);
      http.expectOne('fixture?uuid=' + name).flush(profiles[name]);
      await update();
    }

    it('changes the fixture edited to the profile picked, in the mode it fits its address with, keeping its name', async () => {
      await open();
      await click(treeRow('Head'));

      // the moving head of the project becomes an RGB par
      await exchangeTo('Test - RGB par');

      expect(poolFixture('head').profileUuid).toBe('test/rgb-par');
      expect(poolFixture('head').modeShortName).toBe('6ch');
      expect(poolFixture('head').name).toBe('Head');
      expect(poolFixture('head').dmxFirstChannel).toBe(0);
      expect(element().querySelector('#settings .fixture-type').textContent.trim()).toBe('RGB par');
      expect(project.fixtures[3].profileUuid).toBe('test/moving-head');
    });

    it('loads the profile picked from the library, and renames a fixture named after its old model', async () => {
      await open();
      poolFixture('par-1').name = 'RGB par';

      await exchangeTo('Test - RGB par without dimmer');
      await loadProfile('test/rgb', library[2]);

      // without a mode of as many channels, the first mode of the new model
      expect(poolFixture('par-1').profileUuid).toBe('test/rgb');
      expect(poolFixture('par-1').modeShortName).toBe('4ch');
      expect(poolFixture('par-1').name).toBe('RGB par without dimmer');
      expect(occupied()).toEqual(['0-3', '6-11', '12-17']);
    });

    it('changes all the fixtures selected in the tree, and nothing without a fixture to change', async () => {
      await open();
      pool.onSelectedNodesChange([pool.treeNodes[0].children[0], pool.treeNodes[0].children[1]]);
      await update();

      await exchangeTo('Test - Moving head');

      expect(['par-1', 'par-2'].map((uuid) => poolFixture(uuid).profileUuid)).toEqual(['test/moving-head', 'test/moving-head']);
      expect(poolFixture('bar').profileUuid).toBe('chauvet-dj/colorband-pix');

      // a pool without fixtures to change leaves the button off
      pool.removeFixture(poolFixture('par-1'));
      pool.removeFixture(poolFixture('par-2'));
      pool.removeFixture(poolFixture('bar'));
      pool.removeFixture(poolFixture('head'));
      pool.removeFixture(poolFixture('bar-2'));
      pool.onSelectedNodesChange([]);
      await update();
      expect(exchangeButton('Test - RGB par').classList).toContain('disabled');
      pool.exchangeProfile(new FixtureProfile(library[0]));
    });

    it('tells what the presets set for the old model carry over and what not', async () => {
      project.presets.push(
        new Preset({
          uuid: 'flash',
          name: 'Flash',
          fixtures: [{ fixtureUuid: 'par-2' }],
          steps: [
            {
              uuid: 'flash-1',
              fixtureChannelValues: [
                { profileUuid: 'test/rgb-par', channelName: 'Strobe', value: 132.5 },
                { profileUuid: 'test/rgb-par', channelName: 'Red', value: 255 },
              ],
            },
          ],
        })
      );
      await open();
      await click(treeRow('Par 2'));

      expect(element().querySelector('#settings .exchange-report')).toBeNull();

      await exchangeTo('Test - Moving head');

      const report = element().querySelector('#settings .exchange-report');
      expect(pool.exchangedFrom.uuid).toBe('test/rgb-par');
      expect(report.querySelector('.exchange-carried').textContent).toContain('designer.fixture-pool.exchange-carried');
      // the moving head has no red to carry the red to
      expect(pool.exchangeReport.carried.map((item) => item.from + ' > ' + item.to)).toEqual(['Strobe > Dimmer']);
      expect(Array.from(report.querySelectorAll('.exchange-lost li')).map((item) => item.textContent.replace(/\s+/g, ' ').trim())).toEqual([
        'Flash: Red - designer.fixture-pool.exchange-reason.nothing',
      ]);

      // the values stay as they are until OK
      expect(project.presets[1].steps[0].fixtureChannelValues.length).toBe(2);
    });

    it('tells how many values the presets set which only the model of the fixture edited plays', async () => {
      project.presets.push(
        new Preset({
          uuid: 'flash',
          name: 'Flash',
          fixtures: [{ fixtureUuid: 'par-2' }],
          steps: [{ uuid: 'flash-1', fixtureChannelValues: [{ profileUuid: 'test/rgb-par', channelName: 'Strobe', value: 132.5 }] }],
        })
      );
      await open();

      expect(pool.modelSpecificCount).toBe(1);
      expect(element().querySelector('#settings .model-specific-count')).not.toBeNull();

      await click(treeRow('Head'));
      expect(pool.modelSpecificCount).toBe(0);
      expect(element().querySelector('#settings .model-specific-count')).toBeNull();
    });

    it('carries the values of the old model over on OK, keeping the fixture in its presets', async () => {
      project.presets.push(
        new Preset({
          uuid: 'flash',
          name: 'Flash',
          fixtures: [{ fixtureUuid: 'par-2' }],
          steps: [{ uuid: 'flash-1', fixtureChannelValues: [{ profileUuid: 'test/rgb-par', channelName: 'Strobe', value: 132.5 }] }],
        })
      );
      await open();
      await click(treeRow('Par 2'));
      await exchangeTo('Test - Moving head');

      pool.ok();

      const values = project.presets[1].steps[0].fixtureChannelValues.map((value) => [value.profileUuid, value.channelName, value.value]);
      // the strobe of the moving head shares its dimmer channel (135 to 255), half way through it
      expect(values).toEqual([
        ['test/rgb-par', 'Strobe', 132.5],
        ['test/moving-head', 'Dimmer', 195],
      ]);
      expect(project.fixtures.find((candidate) => candidate.uuid === 'par-2').profileUuid).toBe('test/moving-head');
      expect(project.presets.map((preset) => preset.fixtures.map((presetFixture) => presetFixture.fixtureUuid))).toEqual([
        ['par-2', 'bar'],
        ['par-2'],
      ]);
      // the profile of the old model stays for the other par
      expect(fixtureService.getProfileByUuid('test/rgb-par')).toBeDefined();
    });

    it('carries nothing over for a fixture changed back to its model', async () => {
      project.presets.push(
        new Preset({
          uuid: 'flash',
          name: 'Flash',
          fixtures: [{ fixtureUuid: 'par-2' }],
          steps: [{ uuid: 'flash-1', fixtureChannelValues: [{ profileUuid: 'test/rgb-par', channelName: 'Strobe', value: 132.5 }] }],
        })
      );
      await open();
      await click(treeRow('Par 2'));
      await exchangeTo('Test - Moving head');
      await exchangeTo('Test - RGB par');

      expect(pool.exchangeReport).toBeUndefined();

      pool.ok();

      expect(project.presets[1].steps[0].fixtureChannelValues.length).toBe(1);
    });

    it('carries the values to the mode picked for the new model', async () => {
      await open();
      await click(treeRow('Par 1'));
      await exchangeTo('Chauvet DJ - COLORband PiX');
      const report = spyOn(TestBed.inject(FixtureExchangeService), 'exchange').and.callThrough();

      await choose(selects()[1], '3-channel');

      expect(report).toHaveBeenCalled();
      expect(report.calls.mostRecent().args[4].shortName).toBe('3ch');
    });

    it('keeps the pixels of a bar changed to a bar of as many pixels in its presets', async () => {
      // the bar of the stage is the one of the floor, in the mode of the same number of pixels
      const halves = {
        ...profile('chauvet-dj/colorband-pix'),
        uuid: 'halves',
        name: 'Halves',
      };
      project.fixtureProfiles.push(new FixtureProfile(halves));
      await open();
      await click(treeRow('Bar'));

      pool.exchangeProfile(new FixtureProfile({ uuid: 'halves' }));
      await update();
      expect(poolFixture('bar').modeShortName).toBe('6ch');

      pool.ok();

      expect(project.presets[0].fixtures.map((presetFixture) => presetFixture.fixtureUuid + ' ' + presetFixture.pixelKey)).toEqual([
        'par-2 undefined',
        'bar 1/2',
      ]);
    });
  });

  describe('patching fixtures one after another', () => {
    it('patches the fixtures selected in the order of the tree, from the lowest address among them', async () => {
      await open();
      poolFixture('par-1').dmxFirstChannel = 40;
      poolFixture('par-2').dmxFirstChannel = 30;
      pool.onSelectedNodesChange([pool.treeNodes[0].children[1], pool.treeNodes[0].children[0]]);
      await update();

      await click(element().querySelector('#settings .patch-in-a-row'));

      expect(poolFixture('par-1').dmxFirstChannel).toBe(30);
      expect(poolFixture('par-2').dmxFirstChannel).toBe(36);
    });

    it('only offers it for more than one fixture', async () => {
      await open();

      expect(element().querySelector('#settings .patch-in-a-row')).toBeNull();
      pool.patchInARow();
      expect(poolFixture('par-1').dmxFirstChannel).toBe(0);
    });

    it('says so, when the fixtures do not fit into the universe from there on', async () => {
      await open();
      poolFixture('par-1').dmxFirstChannel = 510;
      poolFixture('par-2').dmxFirstChannel = 505;
      pool.onSelectedNodesChange([pool.treeNodes[0].children[0], pool.treeNodes[0].children[1]]);

      pool.patchInARow();

      expect(error).toHaveBeenCalledWith('designer.fixture-pool.patch-in-a-row-full', 'designer.fixture-pool.channel-occupied-title');
      expect(poolFixture('par-1').dmxFirstChannel).toBe(510);
    });
  });

  // A fixture blinks at full white in the preview and on the stage while its bulb in the tree is on, in the patch
  // edited here (e.g. right after moving it to another address)
  describe('identifying fixtures', () => {
    let previewPatch: jasmine.Spy;
    let endPatchPreview: jasmine.Spy;

    beforeEach(() => {
      previewPatch = spyOn(TestBed.inject(LivePreviewService), 'previewPatch');
      endPatchPreview = spyOn(TestBed.inject(LivePreviewService), 'endPatchPreview').and.callThrough();
    });

    const bulb = (name: string): HTMLElement => treeRow(name).querySelector('.fixture-identify');

    it('lets the fixtures blink while their bulbs are on, on the patch edited', async () => {
      await open();

      await click(bulb('Par 2'));
      await click(bulb('Head'));

      expect(project.identifyFixtureUuids).toEqual(['par-2', 'head']);
      expect(bulb('Par 2').classList).toContain('identifying');
      expect(bulb('Par 1').classList).not.toContain('identifying');
      expect(previewPatch).toHaveBeenCalledWith(pool.fixturePool);
      // the row is not edited by the click
      expect(pool.selectedFixture.uuid).toBe('par-1');

      // moved on the map, the fixture is found on its new channels
      previewPatch.calls.reset();
      pool.setFirstChannel(30);
      expect(previewPatch).toHaveBeenCalled();

      await click(bulb('Par 2'));
      await click(bulb('Head'));

      expect(project.identifyFixtureUuids).toEqual([]);
      expect(endPatchPreview).toHaveBeenCalled();
      expect(previewLive).toHaveBeenCalled();
    });

    it('stops identifying on OK and on cancel, and when it is closed', async () => {
      await open();
      await click(bulb('Par 2'));
      pool.ok();
      expect(project.identifyFixtureUuids).toEqual([]);

      await open();
      await click(bulb('Par 2'));
      previewLive.calls.reset();
      pool.cancel();
      expect(project.identifyFixtureUuids).toEqual([]);
      expect(previewLive).toHaveBeenCalled();

      await open();
      await click(bulb('Par 2'));
      fixture.destroy();
      expect(project.identifyFixtureUuids).toEqual([]);
    });

    it('leaves the stage alone on cancel, when nothing was identified', async () => {
      await open();

      pool.cancel();

      expect(previewLive).not.toHaveBeenCalled();
    });
  });

  describe('folders', () => {
    it('adds a folder in the folder of the fixture edited, after what is in it', async () => {
      await open();

      await click(folderButtons()[2]);

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'designer.fixture.new-folder', 'Bar', 'Head', 'Bar 2']);
      expect(treeRow('designer.fixture.new-folder').classList).toContain('focused');

      pool.ok();

      const added = project.fixtureFolders[1];
      expect(added.name).toBe('designer.fixture.new-folder');
      expect(added.parentUuid).toBe('front');
      expect(added.sortIndex).toBe(2);
    });

    it('adds a folder next to the folder clicked last', async () => {
      await open();
      await click(treeRow('Front'));

      expect(treeNames()).toEqual(['Front', 'Bar', 'Head', 'Bar 2']);
      expect(pool.fixtureFolders[0].expanded).toBe(false);

      await click(folderButtons()[2]);

      expect(treeNames()).toEqual(['Front', 'Bar', 'Head', 'Bar 2', 'designer.fixture.new-folder']);
      // the project keeps its folders until OK
      expect(project.fixtureFolders.length).toBe(1);
      expect(project.fixtureFolders[0].expanded).toBe(true);
    });

    it('renames a folder in place', async () => {
      await open();

      await click(treeRow('Front').querySelector('.inline-edit-value'));
      const input: HTMLInputElement = element().querySelector('.tree-node input.inline-edit-input');
      input.value = 'Truss';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await update();

      expect(treeNames()[0]).toBe('Truss');
      // the click went to the name, not to the folder
      expect(pool.fixtureFolders[0].expanded).toBe(true);

      pool.ok();

      expect(project.fixtureFolders[0].name).toBe('Truss');
    });

    it('removes the folder clicked last, and keeps what was in it in its place', async () => {
      await open();

      await click(folderButtons()[1]);

      // no folder clicked yet
      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2']);

      await click(treeRow('Front'));
      await click(folderButtons()[1]);

      expect(treeNames()).toEqual(['Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2']);

      pool.ok();

      expect(project.fixtureFolders).toEqual([]);
      expect(rows()).toEqual([
        ['par-1', undefined, 0],
        ['par-2', undefined, 1],
        ['bar 1/2', undefined, 2],
        ['bar 2/2', undefined, 3],
        ['head', undefined, 4],
        ['bar-2', undefined, 5],
      ]);
    });

    it('closes all folders and opens them again', async () => {
      await open();
      const icon = () => folderButtons()[0].querySelector('i').classList;

      expect(icon()).toContain('fa-compress');

      await click(folderButtons()[0]);

      expect(treeNames()).toEqual(['Front', 'Bar', 'Head', 'Bar 2']);
      expect(icon()).toContain('fa-expand');

      await click(folderButtons()[0]);

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2']);
    });
  });

  describe('OK and cancel', () => {
    it('leaves the project as it was, when it is cancelled', async () => {
      await open();
      const fixtures = project.fixtures;

      await type(element().querySelector('#fixtureName'), 'Left par');
      pool.removeFixture(poolFixture('head'));

      await click(element().querySelector('.modal-footer a'));

      expect(project.fixtures).toBe(fixtures);
      expect(project.fixtures.map((candidate) => candidate.name)).toEqual(['Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2']);
      expect(closed).toEqual([2]);
      expect(hide).toHaveBeenCalled();

      await click(element().querySelector('.modal-header button.close'));

      expect(closed).toEqual([2, 2]);
    });

    it('hands the fixtures over to the project on OK and lets everything know', async () => {
      await open();
      const presetService = TestBed.inject(PresetService);
      let selectionChanged = 0;
      presetService.fixtureSelectionChanged.subscribe(() => selectionChanged++);

      await type(element().querySelector('#fixtureName'), 'Left par');
      await click(element().querySelector('.modal-footer button'));

      expect(project.fixtures.map((candidate) => candidate.name)).toEqual(['Left par', 'Par 2', 'Bar', 'Head', 'Bar 2']);
      expect(fixtureService.getCachedFixtureByUuid('par-1', undefined).fixture.name).toBe('Left par');
      expect(selectionChanged).toBe(1);
      expect(previewLive).toHaveBeenCalled();
      expect(closed).toEqual([1]);
      expect(hide).toHaveBeenCalled();
    });

    it('keeps the order of the fixture panel, when nothing was moved', async () => {
      await open();
      const before = rows();

      pool.ok();

      expect(rows()).toEqual(before);
      expect(project.presets[0].fixtures.length).toBe(2);
    });

    it('does not take fixtures which collide on their channels', async () => {
      await open();
      await click(treeRow('Head'));
      poolFixture('bar-2').dmxFirstChannel = 2;

      pool.ok();

      expect(error).toHaveBeenCalledWith('designer.fixture-pool.channel-occupied', 'designer.fixture-pool.channel-occupied-title');
      expect(closed).toEqual([]);
      expect(hide).not.toHaveBeenCalled();
      expect(project.fixtures[4].dmxFirstChannel).toBe(6);
    });

    it('does not take two different fixtures on the same channels, even with modes of the same name', async () => {
      await open();
      await click(treeRow('Head'));

      // the moving head onto the channels of the first par, both in their '6ch' mode
      await choose(selects()[2], 'Stage');
      await choose(selects()[0], 'Stage');
      await click(treeRow('Head'));

      expect(flags('overlapped')).toEqual([0, 1, 2, 3, 4, 5]);

      pool.ok();

      expect(error).toHaveBeenCalledWith('designer.fixture-pool.channel-occupied', 'designer.fixture-pool.channel-occupied-title');
      expect(closed).toEqual([]);
    });

    it('adds the rows of a new fixture into its folder, in the order the presets chase in as well', async () => {
      await open();

      pool.addFixture(new FixtureProfile(library[0]));
      await update();
      const added = pool.selectedFixture.uuid;

      pool.ok();

      expect(rows()).toEqual([
        ['par-1', 'front', 0],
        ['par-2', 'front', 1],
        [added, 'front', 2],
        ['bar 1/2', undefined, 1],
        ['bar 2/2', undefined, 2],
        ['head', undefined, 3],
        ['bar-2', undefined, 4],
      ]);
    });

    it('adds the rows of a new fixture at the end of its folder, also where a removed fixture left a gap', async () => {
      await open();
      pool.removeFixture(poolFixture('bar'));
      await click(treeRow('Head'));
      await click(element().querySelector('#settings button.btn-primary'));
      const copy = pool.selectedFixture.uuid;

      pool.ok();

      expect(rows()).toEqual([
        ['par-1', 'front', 0],
        ['par-2', 'front', 1],
        ['head', undefined, 1],
        ['bar-2', undefined, 2],
        [copy, undefined, 3],
      ]);
    });

    it('adds the rows of a new fixture and its pixels at the end of its folder, and drops the ones of a removed fixture', async () => {
      await open();
      await click(treeRow('Bar'));
      await click(element().querySelector('#settings button.btn-primary'));
      const copy = pool.selectedFixture.uuid;
      pool.removeFixture(poolFixture('par-2'));

      pool.ok();

      expect(rows()).toEqual([
        ['par-1', 'front', 0],
        ['bar 1/2', undefined, 1],
        ['bar 2/2', undefined, 2],
        ['head', undefined, 3],
        ['bar-2', undefined, 4],
        [copy + ' 1/2', undefined, 5],
        [copy + ' 2/2', undefined, 6],
      ]);
      // the preset does not light the removed fixture anymore, but the copy of the bar along
      // with the bar, as it is the same lamp
      expect(project.presets[0].fixtures.map((presetFixture) => presetFixture.fixtureUuid)).toEqual(['bar', copy]);
    });

    it('builds the rows of a fixture whose mode changed again', async () => {
      await open();
      await click(treeRow('Bar'));
      await choose(selects()[1], '3-channel');

      pool.ok();

      expect(rows()).toEqual([
        ['par-1', 'front', 0],
        ['par-2', 'front', 1],
        ['head', undefined, 1],
        ['bar-2', undefined, 2],
        ['bar', undefined, 3],
      ]);
      // the pixel is gone from the preset as well
      expect(project.presets[0].fixtures.map((presetFixture) => presetFixture.fixtureUuid)).toEqual(['par-2']);
    });

    it('puts a fixture moved in the tree there in the panel too, its pixels along with it', async () => {
      await open();

      dragAndDrop(treeRow('Bar'), treeRow('Front'));
      await update();

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar', 'Head', 'Bar 2']);
      expect(pool.treeNodes[0].children.map((node: TreeNode) => node.fixture.uuid)).toEqual(['par-1', 'par-2', 'bar']);

      const syncPresetOrders = spyOn(TestBed.inject(FixtureOrderService), 'syncPresetOrders').and.callThrough();
      pool.ok();

      expect(rows()).toEqual([
        ['par-1', 'front', 0],
        ['par-2', 'front', 1],
        ['bar 1/2', 'front', 2],
        ['bar 2/2', 'front', 3],
        ['head', undefined, 1],
        ['bar-2', undefined, 2],
      ]);
      expect(project.fixtures.map((candidate) => candidate.uuid)).toEqual(['par-1', 'par-2', 'bar', 'head', 'bar-2']);
      expect(syncPresetOrders).toHaveBeenCalled();
    });

    it('gives the fixtures without rows theirs where the tree has them, when the tree was moved', async () => {
      project.fixtures.push(new Fixture({ ...project.fixtures[0], uuid: 'spare', name: 'Spare', dmxFirstChannel: 30 }));
      project.presetFixtures = project.presetFixtures.filter((presetFixture) => presetFixture.fixtureUuid !== 'head');
      await open();

      dragAndDrop(treeRow('Bar 2'), treeRow('Bar'), 0.1);
      await update();

      expect(treeNames()).toEqual(['Front', 'Par 1', 'Par 2', 'Bar 2', 'Bar', 'Head', 'Spare']);

      pool.ok();

      expect(rows().map((row) => row[0] + ' ' + row[2])).toEqual([
        'par-1 0',
        'par-2 1',
        'bar-2 1',
        'bar 1/2 2',
        'bar 2/2 3',
        'head 4',
        'spare 5',
      ]);
    });

    it('confirms on enter, unless a name is typed or another dialog is on top of it', async () => {
      await open();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(closed).toEqual([1]);

      element()
        .querySelector('#fixtureName')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(closed).toEqual([1]);

      modalsCount = 2;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(closed).toEqual([1]);
    });

    it('points to the hardware which plays the patch, in the online designer', async () => {
      config.hardwarePromo = true;
      await open();

      expect(element().querySelector('.dmx-promo-hint a').getAttribute('href')).toContain('utm_content=dmx-overview');
    });

    // drag a row of the tree onto the middle of another one (into a folder) or its top
    function dragAndDrop(from: HTMLElement, to: HTMLElement, at = 0.5) {
      for (const [type, target] of [
        ['dragstart', from],
        ['dragover', to],
        ['drop', to],
      ] as [string, HTMLElement][]) {
        const rect = target.getBoundingClientRect();
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 4,
          clientY: rect.top + rect.height * at,
        });
        Object.defineProperty(event, 'dataTransfer', { value: { setData: () => {} } });
        target.dispatchEvent(event);
        fixture.detectChanges();
      }
    }
  });
});
