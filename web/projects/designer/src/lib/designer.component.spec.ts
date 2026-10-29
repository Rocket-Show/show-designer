import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';
import { of, throwError } from 'rxjs';

import { DesignerLayout } from './designer-layout';
import { DesignerComponent } from './designer.component';
import { HardwarePromoBarComponent } from './hardware-promo/hardware-promo-bar.component';
import { HardwarePromoDialogComponent } from './hardware-promo/hardware-promo-dialog.component';
import { InlineEditComponent } from './inline-edit/inline-edit.component';
import { IntroComponent } from './intro/intro.component';
import { Project } from './models/project';
import { ProjectBrowserComponent } from './project/project-browser/project-browser.component';
import { ProjectImportComponent } from './project/project-import/project-import.component';
import { ProjectSaveComponent } from './project/project-save/project-save.component';
import { ProjectShareComponent } from './project/project-share/project-share.component';
import { ConfigService } from './services/config.service';
import { EffectService } from './services/effect.service';
import { ErrorDialogService } from './services/error-dialog.service';
import { FixturePoolService } from './services/fixture-pool.service';
import { FixtureService } from './services/fixture.service';
import { IntroService } from './services/intro.service';
import { LayoutService } from './services/layout.service';
import { PresetService } from './services/preset.service';
import { ProjectLoadService } from './services/project-load.service';
import { ProjectService } from './services/project.service';
import { TimelineService } from './services/timeline.service';
import { UndoService } from './services/undo.service';
import { UserEnsureLoginService } from './services/user-ensure-login.service';
import { UserService } from './services/user.service';
import { WarningDialogService } from './services/warning-dialog.service';
import { UserRegisterComponent } from './user/user-register/user-register.component';

// The designer as the host app embeds it: the menus, the panels and the hotkeys around the
// project, which it opens as it starts up. The panels themselves are left out.
describe('DesignerComponent', () => {
  const keys = [
    'language',
    'designerLayout',
    'showIntro',
    'projectId',
    'projectName',
    'hardwarePromoSessions',
    'hardwarePromoLastVisit',
    'hardwarePromoBarDismissed',
  ];
  let stored: { [key: string]: string };
  let url: string;

  let fixture: ComponentFixture<DesignerComponent>;
  let component: DesignerComponent;
  let project: Project;
  let configService: ConfigService;
  let projectLoadService: ProjectLoadService;
  let show: jasmine.Spy;
  let warn: jasmine.Spy;
  let showError: jasmine.Spy;
  let warningAnswer: boolean;

  beforeEach(() => {
    stored = {};
    for (const key of keys) {
      stored[key] = localStorage.getItem(key);
      localStorage.removeItem(key);
    }
    url = window.location.href;

    show = jasmine.createSpy('show');

    TestBed.configureTestingModule({
      declarations: [DesignerComponent, InlineEditComponent, IntroComponent, HardwarePromoBarComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        { provide: BsModalService, useValue: { show } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
      // the panels have specs of their own
      schemas: [NO_ERRORS_SCHEMA],
    });

    configService = TestBed.inject(ConfigService);
    project = new Project({
      uuid: 'show',
      name: 'Rock',
      presets: [{ uuid: 'warm', name: 'Warm', icon: 'fa-fire', colorAuto: false, color: '#ff0000' }],
    });
    TestBed.inject(ProjectService).project = project;

    projectLoadService = TestBed.inject(ProjectLoadService);
    spyOn(projectLoadService, 'load').and.returnValue(of(undefined));
    spyOn(projectLoadService, 'template');
    spyOn(projectLoadService, 'new');

    warningAnswer = true;
    warn = spyOn(TestBed.inject(WarningDialogService), 'show').and.callFake(() => of(warningAnswer));
    showError = spyOn(TestBed.inject(ErrorDialogService), 'show').and.returnValue(of(true));
    spyOn(TestBed.inject(UserEnsureLoginService), 'login').and.returnValue(of(undefined));
  });

  afterEach(() => {
    for (const key of keys) {
      if (stored[key] === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, stored[key]);
      }
    }
    history.replaceState(null, '', url);
  });

  async function open() {
    fixture = TestBed.createComponent(DesignerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // the panels are laid out on the next turn
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // opened by a link with the passed query
  function linked(query: string) {
    history.replaceState(null, '', window.location.pathname + query);
  }

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector);
  }

  // the entry of a menu, by the key of its label
  function menuItem(label: string): HTMLElement {
    const items: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('nav a'));
    return items.find((item) => item.textContent.trim() === label);
  }

  function click(label: string) {
    menuItem(label).click();
    fixture.detectChanges();
  }

  function press(key: string, modifiers: KeyboardEventInit = {}, target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
    target.dispatchEvent(event);
    return event;
  }

  describe('starting up', () => {
    it('opens the project of the link it is opened with', async () => {
      linked('?id=5&name=Rock&token=abc');
      await open();

      expect(projectLoadService.load).toHaveBeenCalledWith(5, 'Rock', 'abc');
      expect(projectLoadService.template).not.toHaveBeenCalled();
    });

    it('opens a project linked without a share token', async () => {
      linked('?id=5');
      await open();

      expect(projectLoadService.load).toHaveBeenCalledWith(5, null, '');
    });

    it('opens the project saved last again, for the user logged in', async () => {
      configService.loginAvailable = true;
      spyOn(TestBed.inject(UserService), 'isLoggedIn').and.returnValue(true);
      localStorage.setItem('projectId', '7');
      localStorage.setItem('projectName', 'Show');
      await open();

      expect(projectLoadService.load).toHaveBeenCalledWith(7, 'Show');
    });

    it('opens the project saved last again where nobody logs in (on a Rocket Show device)', async () => {
      localStorage.setItem('projectName', 'Show');
      await open();

      expect(projectLoadService.load).toHaveBeenCalledWith(null, 'Show');
    });

    it('starts with the template for a user not logged in', async () => {
      configService.loginAvailable = true;
      localStorage.setItem('projectId', '7');
      await open();

      expect(projectLoadService.load).not.toHaveBeenCalled();
      expect(projectLoadService.template).toHaveBeenCalled();
    });

    it('starts with the template without a project saved before', async () => {
      await open();

      expect(projectLoadService.template).toHaveBeenCalled();
    });

    it("says why the project couldn't be opened, and starts a new one", async () => {
      spyOn(console, 'error');
      (projectLoadService.load as jasmine.Spy).and.returnValue(
        throwError(new HttpErrorResponse({ status: 404, error: { error: 'not-found' } }))
      );
      linked('?id=5');
      await open();

      expect(showError).toHaveBeenCalledWith('designer.project.open-error', 'not-found');
      expect(projectLoadService.new).toHaveBeenCalled();
    });

    it('asks a user without the permission to have the project shared', async () => {
      spyOn(console, 'error');
      (projectLoadService.load as jasmine.Spy).and.returnValue(
        throwError(new HttpErrorResponse({ status: 403, error: { error: 'no-permission' } }))
      );
      localStorage.setItem('projectName', 'Show');
      await open();

      expect(showError).toHaveBeenCalledWith('designer.project.open-no-permission', undefined);
    });

    it('speaks the language picked last, English otherwise', async () => {
      await open();

      expect(TestBed.inject(TranslateService).currentLang).toBe('en');

      localStorage.setItem('language', 'de');
      component.ngOnInit();

      expect(TestBed.inject(TranslateService).currentLang).toBe('de');
    });

    it('counts the visit, in the free online designer', async () => {
      configService.hardwarePromo = true;
      await open();

      expect(localStorage.getItem('hardwarePromoSessions')).toBe('1');
    });

    it('takes its settings from the host app', async () => {
      fixture = TestBed.createComponent(DesignerComponent);
      const inputs: { [name: string]: any } = {
        restUrl: 'https://example.com/api/',
        enableMediaLibrary: true,
        loginAvailable: true,
        shareAvailable: true,
        languageSwitch: true,
        livePreview: true,
        localProfiles: true,
        uniqueProjectNames: true,
        dropzoneChunking: false,
        freeUniverseEdit: true,
        hardwarePromo: true,
      };
      for (const name of Object.keys(inputs)) {
        fixture.componentRef.setInput(name, inputs[name]);
      }
      fixture.componentRef.setInput('externalCompositionsAvailable', true);
      fixture.componentRef.setInput('universes', null);
      fixture.componentRef.setInput('intro', true);
      fixture.componentRef.setInput('menuHeightPx', 50);
      fixture.detectChanges();
      await fixture.whenStable();

      for (const name of Object.keys(inputs)) {
        expect((configService as any)[name]).toBe(inputs[name], name);
      }
      expect(TestBed.inject(TimelineService).externalCompositionsAvailable).toBe(true);
      expect(configService.universes).toEqual([]);
      expect(TestBed.inject(IntroService).showIntro).toBe(true);
      // the menu of the host and the one of the designer are taken away from the height
      expect(fixture.nativeElement.querySelector('#designer').style.height).toBe('calc(100% - 84px)');
    });
  });

  describe('laying out the panels', () => {
    let build: jasmine.Spy;

    beforeEach(() => {
      build = spyOn(DesignerLayout.prototype, 'build').and.callThrough();
    });

    it('splits the rows into panels, and fits the preview and the timeline into them', async () => {
      fixture = TestBed.createComponent(DesignerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      const preview = jasmine.createSpyObj('preview', ['onResize']);
      const timeline = jasmine.createSpyObj('timeline', ['onResize']);
      component.previewComponent = preview;
      component.timelineComponent = timeline;
      await fixture.whenStable();

      expect(build).toHaveBeenCalled();
      expect(element('#row1').querySelectorAll('.gutter').length).toBeGreaterThan(0);
      expect(preview.onResize).toHaveBeenCalled();
      expect(timeline.onResize).toHaveBeenCalled();
    });

    it('lays them out again when they are folded or opened', async () => {
      await open();
      build.calls.reset();

      TestBed.inject(LayoutService).toggle('scenes');

      expect(build).toHaveBeenCalled();
    });

    it('lays them out again in another language, for the titles of the arrows', async () => {
      await open();
      build.calls.reset();

      TestBed.inject(TranslateService).use('de');

      expect(build).toHaveBeenCalled();
    });

    it('picks the layouts and the panels in the view menu', async () => {
      await open();
      const layoutService = TestBed.inject(LayoutService);

      expect(menuItem('designer.layout.layout-default').querySelector('i').classList).toContain('fa-dot-circle-o');
      expect(menuItem('designer.layout.layout-show').querySelector('i').classList).toContain('fa-circle-o');

      expect(menuItem('designer.layout.panel-presets').querySelector('i').classList).toContain('fa-check');

      click('designer.layout.panel-presets');

      expect(layoutService.isFolded('presets')).toBe(true);
      expect(menuItem('designer.layout.panel-presets').querySelector('i').classList).not.toContain('fa-check');

      click('designer.layout.layout-show');

      expect(layoutService.layout).toBe('show');
      expect(layoutService.isFolded('fixtures')).toBe(true);
      expect(menuItem('designer.layout.layout-show').querySelector('i').classList).toContain('fa-dot-circle-o');
    });
  });

  describe('the project menu', () => {
    beforeEach(async () => {
      await open();
    });

    it('starts a new project, once the unsaved changes may go', () => {
      click('designer.navigation.project-new');

      expect(warn).toHaveBeenCalledWith('designer.misc.warning-proceed-unsaved');
      expect(projectLoadService.new).toHaveBeenCalled();
    });

    it('keeps the project, if the user says so', () => {
      warningAnswer = false;

      click('designer.navigation.project-new');
      click('designer.navigation.project-open');
      click('designer.navigation.project-import');

      expect(projectLoadService.new).not.toHaveBeenCalled();
      expect(show).not.toHaveBeenCalled();
    });

    it('opens a project, once the unsaved changes may go and the user is logged in', () => {
      click('designer.navigation.project-open');

      expect(TestBed.inject(UserEnsureLoginService).login).toHaveBeenCalled();
      expect(show).toHaveBeenCalledWith(ProjectBrowserComponent, { keyboard: true, ignoreBackdropClick: false });
    });

    it('saves a project saved before right away', () => {
      const save = spyOn(TestBed.inject(ProjectService), 'save');

      click('designer.navigation.project-save');

      expect(save).toHaveBeenCalledWith(project);
      expect(show).not.toHaveBeenCalled();
    });

    it('asks for the name of a project never saved', () => {
      const save = spyOn(TestBed.inject(ProjectService), 'save');
      project.name = undefined;

      click('designer.navigation.project-save');

      expect(save).not.toHaveBeenCalled();
      expect(show).toHaveBeenCalledWith(ProjectSaveComponent, { keyboard: true, ignoreBackdropClick: false });
    });

    it('saves the project under another name', () => {
      click('designer.navigation.project-save-as');

      expect(TestBed.inject(UserEnsureLoginService).login).toHaveBeenCalled();
      expect(show).toHaveBeenCalledWith(ProjectSaveComponent, { keyboard: true, ignoreBackdropClick: false });
    });

    it('imports a project, once the unsaved changes may go', () => {
      click('designer.navigation.project-import');

      expect(warn).toHaveBeenCalledWith('designer.misc.warning-proceed-unsaved');
      expect(show).toHaveBeenCalledWith(ProjectImportComponent, { keyboard: true, ignoreBackdropClick: false });
    });

    describe('exporting', () => {
      let exported: HTMLAnchorElement;

      beforeEach(() => {
        spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
          // the menu entries are links as well
          if (this.hasAttribute('download')) {
            exported = this;
            expect(document.body.contains(this)).toBe(true);
          } else {
            this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        });
      });

      it('downloads the project as a file named after it', () => {
        const saved = spyOn(TestBed.inject(ProjectService), 'getSavedJson').and.callThrough();

        click('designer.navigation.project-export');

        // like it is saved, with the colors of the scenes
        expect(saved).toHaveBeenCalledWith(project, 2);

        expect(exported.download).toBe('Rock.rsd');
        const json = decodeURIComponent(exported.href.replace('data:text/json;charset=UTF-8,', ''));
        expect(JSON.parse(json).uuid).toBe('show');
        // the values of the first steps for a Rocket Show which doesn't know steps yet
        expect(JSON.parse(json).presets[0].fixtureChannelValues).toEqual([]);
        expect(document.body.contains(exported)).toBe(false);
        expect(show).not.toHaveBeenCalled();
      });

      it('points at the hardware to play the show on, in the free online designer', () => {
        configService.hardwarePromo = true;

        click('designer.navigation.project-export');

        expect(show).toHaveBeenCalledWith(HardwarePromoDialogComponent, { keyboard: true, ignoreBackdropClick: false });
      });
    });

    it('shares a project saved before', () => {
      configService.shareAvailable = true;
      fixture.detectChanges();
      project.id = 5;

      click('designer.navigation.project-share');

      // a click into the link to select it would close the dialog otherwise
      expect(show).toHaveBeenCalledWith(ProjectShareComponent, { keyboard: true, ignoreBackdropClick: true });
    });

    it('asks to save a project before sharing it', () => {
      configService.shareAvailable = true;
      fixture.detectChanges();

      click('designer.navigation.project-share');

      expect(showError).toHaveBeenCalledWith('designer.project.share-no-save');
      expect(show).not.toHaveBeenCalled();
    });

    it('renames the project in the menu bar', async () => {
      const name: HTMLElement = element('lib-app-inline-edit .inline-edit-value');
      expect(name.textContent).toBe('Rock');

      name.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const input: HTMLInputElement = element('lib-app-inline-edit input');
      input.value = 'Punk';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));

      expect(project.name).toBe('Punk');
    });
  });

  describe('the other menus', () => {
    beforeEach(async () => {
      await open();
    });

    it('undoes and redoes the changes, as far as there are any', () => {
      const undoService = TestBed.inject(UndoService);
      const captureChanges = spyOn(undoService, 'captureChanges').and.callThrough();
      const undo = spyOn(undoService, 'undo');
      const redo = spyOn(undoService, 'redo');

      element('#editDropdown').click();

      expect(captureChanges).toHaveBeenCalled();
      expect(menuItem('designer.navigation.undo').classList).toContain('disabled');
      expect(menuItem('designer.navigation.redo').classList).toContain('disabled');

      click('designer.navigation.undo');
      click('designer.navigation.redo');

      expect(undo).toHaveBeenCalled();
      expect(redo).toHaveBeenCalled();
    });

    it('opens the fixture pool', () => {
      const open = spyOn(TestBed.inject(FixturePoolService), 'open');

      click('designer.navigation.fixture-pool');

      expect(open).toHaveBeenCalled();
    });

    it('starts the introduction again', () => {
      const introService = TestBed.inject(IntroService);
      introService.next();

      click('designer.navigation.reset-intro');

      expect(introService.showIntro).toBe(true);
      expect(introService.activeStep).toBe('start');
      expect(element('lib-app-intro .card')).not.toBeNull();
    });

    it('switches the language for good', () => {
      configService.languageSwitch = true;
      fixture.detectChanges();

      click('Deutsch');

      expect(TestBed.inject(TranslateService).currentLang).toBe('de');
      expect(localStorage.getItem('language')).toBe('de');
    });

    it('lets a user register or log in, and log out again', () => {
      const userService = TestBed.inject(UserService);
      configService.loginAvailable = true;
      fixture.detectChanges();

      click('designer.navigation.login');

      expect(show).toHaveBeenCalledWith(UserRegisterComponent, { keyboard: true, ignoreBackdropClick: false });

      userService.token = 'token';
      userService.tokenExpiration = new Date(Date.now() + 60000);
      userService.username = 'Moritz';
      fixture.detectChanges();

      expect(menuItem('designer.navigation.login')).toBeUndefined();
      expect(menuItem('Moritz')).toBeDefined();

      const logout = spyOn(userService, 'logout');
      click('designer.navigation.logout');

      expect(logout).toHaveBeenCalled();
    });

    it('offers neither logging in nor sharing on a Rocket Show device', () => {
      expect(menuItem('designer.navigation.login')).toBeUndefined();
      expect(menuItem('designer.navigation.project-share')).toBeUndefined();
      expect(menuItem('Deutsch')).toBeUndefined();
    });
  });

  describe('the tabs of the panels below the presets', () => {
    beforeEach(async () => {
      await open();
    });

    function tab(id: string) {
      element('#v-pills-' + id + '-tab').click();
      fixture.detectChanges();
    }

    it('selects the fixtures to set up in the settings', () => {
      tab('settings');

      expect(component.currentTab).toBe('settings');
      expect(TestBed.inject(FixtureService).settingsSelection).toBe(true);

      tab('capabilities');

      expect(component.currentTab).toBe('capabilities');
      expect(TestBed.inject(FixtureService).settingsSelection).toBe(false);
    });

    it('tells the effects when they are shown', () => {
      const effectService = TestBed.inject(EffectService);
      let told = 0;
      effectService.effectsOpenChanged.subscribe(() => told++);

      tab('effects');

      expect(effectService.effectsOpen).toBe(true);

      tab('channels');

      expect(effectService.effectsOpen).toBe(false);
      expect(told).toBe(2);
    });

    it('shows and hides the steps of the presets', () => {
      const presetService = TestBed.inject(PresetService);
      const visible = presetService.stepsVisible;

      element('.nav-link-divider:not([id])').click();
      fixture.detectChanges();

      expect(presetService.stepsVisible).toBe(!visible);
    });

    it('says which preset they edit, marked like in the list', () => {
      TestBed.inject(PresetService).selectedPreset = project.presets[0];
      fixture.detectChanges();

      const target = element('.edit-target');
      expect(target.textContent.trim()).toBe('Warm');
      expect(target.querySelector('i').classList).toContain('fa-fire');
      expect(target.querySelector('i').style.color).toBe('rgb(255, 0, 0)');
    });
  });

  describe('the hotkeys', () => {
    let undo: jasmine.Spy;
    let redo: jasmine.Spy;

    beforeEach(async () => {
      await open();
      undo = spyOn(TestBed.inject(UndoService), 'undo');
      redo = spyOn(TestBed.inject(UndoService), 'redo');
    });

    // a field of the panels, which takes the keys typed into it
    function field(type: string): HTMLInputElement {
      const input = document.createElement('input');
      input.type = type;
      fixture.nativeElement.appendChild(input);
      return input;
    }

    it('undo with ctrl or cmd and z', () => {
      expect(press('z', { ctrlKey: true }).defaultPrevented).toBe(true);
      press('Z', { metaKey: true });

      expect(undo).toHaveBeenCalledTimes(2);
      expect(redo).not.toHaveBeenCalled();
    });

    it('redo with ctrl or cmd and y, or with shift and z', () => {
      press('y', { ctrlKey: true });
      press('z', { metaKey: true, shiftKey: true });

      expect(redo).toHaveBeenCalledTimes(2);
      expect(undo).not.toHaveBeenCalled();
    });

    it("leave undoing what is typed to the field it's typed into", () => {
      const event = press('z', { ctrlKey: true }, field('text'));

      expect(undo).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('undo with a checkbox in focus as well', () => {
      press('z', { ctrlKey: true }, field('checkbox'));

      expect(undo).toHaveBeenCalled();
    });

    it('leave the other keys alone', () => {
      expect(press('a', { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(undo).not.toHaveBeenCalled();
    });

    it('open the fixture pool with p, unless it is typed into a field', () => {
      const open = spyOn(TestBed.inject(FixturePoolService), 'open');

      expect(press('p').defaultPrevented).toBe(true);
      press('p', {}, field('checkbox'));

      expect(open).toHaveBeenCalledTimes(1);
    });

    it('start a new project with ctrl or cmd and n', () => {
      expect(press('n', { ctrlKey: true }).defaultPrevented).toBe(true);
      press('n', { metaKey: true });

      expect(projectLoadService.new).toHaveBeenCalledTimes(2);
    });

    it('save with ctrl or cmd and s', () => {
      const save = spyOn(TestBed.inject(ProjectService), 'save');

      expect(press('s', { ctrlKey: true }).defaultPrevented).toBe(true);

      expect(save).toHaveBeenCalledWith(project);
    });

    it('open a project with ctrl or cmd and o', () => {
      expect(press('o', { metaKey: true }).defaultPrevented).toBe(true);

      expect(show).toHaveBeenCalledWith(ProjectBrowserComponent, { keyboard: true, ignoreBackdropClick: false });
    });
  });
});
