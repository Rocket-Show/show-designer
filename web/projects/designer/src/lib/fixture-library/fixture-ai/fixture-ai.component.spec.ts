import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';
import { of, Subject, throwError } from 'rxjs';

import { profiles } from '../../../../conformance/index';
import { AiFixturesResponse, AiFixturesStatus } from '../../models/ai-fixtures';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureVersion } from '../../models/fixture-version';
import { Project } from '../../models/project';
import { AiFixturesService } from '../../services/ai-fixtures.service';
import { ConfigService } from '../../services/config.service';
import { FixtureLibraryService } from '../../services/fixture-library.service';
import { ProjectService } from '../../services/project.service';
import { UserService } from '../../services/user.service';
import { FixtureVersionBadgesComponent } from '../fixture-version-badges/fixture-version-badges.component';
import { FixtureAiComponent, FixtureAiResult } from './fixture-ai.component';

// "Create profile with AI": the fixture and its manual, the lookup in the library (free), the AI at work, and the review
// of the profile it made before it goes into the project; or a version the AI improves as the user says.
describe('FixtureAiComponent', () => {
  let fixture: ComponentFixture<FixtureAiComponent>;
  let component: FixtureAiComponent;
  let project: Project;
  let ai: { getStatus: jasmine.Spy; lookup: jasmine.Spy; generate: jasmine.Spy; sha256: jasmine.Spy };
  let manufacturers: jasmine.Spy;
  let hide: jasmine.Spy;
  let logout: jasmine.Spy;
  let closed: FixtureAiResult[];

  const status: AiFixturesStatus = {
    available: true,
    requestsLast24Hours: 1,
    requestsPerUserPerDay: 5,
    maxManualBytes: 1024 * 1024,
    maxInputTokens: 400000,
  };

  const found: FixtureVersion = {
    uuid: 'acme/par~1',
    manufacturerName: 'Acme',
    name: 'Par',
    origin: 'ofl',
    state: 'open',
    created: '2026-11-01T10:00:00Z',
    modeStates: [
      { shortName: '6ch', name: '6-channel', hash: 'a', state: 'confirmed', good: 2, bad: 0 },
      { shortName: '3ch', name: '', hash: 'b', state: 'open', good: 0, bad: 0 },
    ],
  };

  // the RGB par of the conformance cases, as the AI made it, with a mode of three channels as well
  function response(uuid = 'acme/par~2'): AiFixturesResponse {
    const profile = JSON.parse(JSON.stringify(profiles['test/rgb-par']));
    profile.modes.push({ name: '3-channel', shortName: '3ch', channels: ['Red', 'Green', 'Blue'] });

    return {
      version: { uuid, origin: 'ai', state: 'open', manufacturerShortName: 'acme', manufacturerName: 'Acme' },
      profile,
      review: { channels: { Red: { page: 4, quote: 'CH2 Red', verified: false, uncertain: null } }, uncertain: ['The dimmer curve'] },
      requestsLast24Hours: 2,
      requestsPerUserPerDay: 5,
    };
  }

  beforeEach(() => {
    hide = jasmine.createSpy('hide');
    logout = jasmine.createSpy('logout');
    ai = {
      getStatus: jasmine.createSpy('getStatus').and.returnValue(of(status)),
      lookup: jasmine.createSpy('lookup').and.returnValue(of({ versions: [found], manualKnown: false })),
      generate: jasmine.createSpy('generate').and.returnValue(of(response())),
      sha256: jasmine.createSpy('sha256').and.returnValue(Promise.resolve('abc')),
    };
    manufacturers = jasmine.createSpy('getManufacturers').and.returnValue(of([{ shortName: 'acme', name: 'Acme' }]));

    TestBed.configureTestingModule({
      declarations: [FixtureAiComponent, FixtureVersionBadgesComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: BsModalService, useValue: {} },
        { provide: AiFixturesService, useValue: ai },
        { provide: FixtureLibraryService, useValue: { getManufacturers: manufacturers } },
        { provide: UserService, useValue: { logout, isLoggedIn: () => true } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    project = new Project();
    TestBed.inject(ProjectService).project = project;
    closed = [];
  });

  function open(parent?: FixtureVersion) {
    fixture = TestBed.createComponent(FixtureAiComponent);
    component = fixture.componentInstance;
    component.parent = parent;
    component.onClose.subscribe((result) => closed.push(result));
    fixture.detectChanges();
  }

  // a fixture of a manufacturer of the library, with its manual
  function fill() {
    component.manufacturerShortName = 'acme';
    component.model = ' Par ';
    component.setManual(new File(['%PDF'], 'par.pdf'));
    fixture.detectChanges();
  }

  const element = (): HTMLElement => fixture.nativeElement;
  const footerButton = (): HTMLButtonElement => element().querySelector('.modal-footer .btn-primary');

  it('starts with the status of the user and the manufacturers of the library', () => {
    open();

    expect(component.loadingStatus).toBe(false);
    expect(component.available).toBe(true);
    expect(component.requestsLeft).toBe(4);
    expect(component.manufacturers).toEqual([{ shortName: 'acme', name: 'Acme' }]);
    expect(element().querySelector('.modal-footer').textContent).toContain('designer.fixture-ai.requests-left');
    expect(component.complete).toBe(false);
    expect(footerButton().disabled).toBe(true);
  });

  it('names a new manufacturer when the list of the library could not be loaded', () => {
    manufacturers.and.returnValue(throwError(new Error('offline')));
    open();

    expect(component.newManufacturer).toBe(true);
  });

  it('needs the manufacturer, the model and what to read', () => {
    open();
    fill();
    expect(component.complete).toBe(true);

    component.model = ' ';
    expect(component.complete).toBe(false);
    component.model = 'Par';

    component.manufacturerShortName = '';
    expect(component.complete).toBe(false);
    component.manufacturerShortName = FixtureAiComponent.newManufacturer;
    expect(component.complete).toBe(false);
    component.manufacturerName = 'Lumen';
    expect(component.complete).toBe(true);

    component.setSource('link');
    component.link = 'example.com/par.pdf';
    expect(component.complete).toBe(false);
    component.link = ' https://example.com/par.pdf ';
    expect(component.complete).toBe(true);

    component.setSource('search');
    expect(component.complete).toBe(true);

    component.setSource('manual');
    component.setManual(undefined);
    expect(component.complete).toBe(false);
  });

  it('refuses a manual larger than the API takes', () => {
    open();

    component.setManual({ size: 3 * 1024 * 1024, name: 'large.pdf' } as File);

    expect(component.manual).toBeUndefined();
    expect(component.error).toEqual({ key: 'designer.fixture-ai.manual-too-large', params: { size: '3.0', max: '1.0' } });
  });

  it('looks the fixture up in the library first, by its manual as well, and shows what it has', async () => {
    open();
    fill();

    footerButton().click();
    expect(component.view).toBe('looking');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(ai.sha256).toHaveBeenCalledWith(component.manual);
    expect(ai.lookup).toHaveBeenCalledWith('acme', 'Par', 'abc');
    expect(component.view).toBe('found');
    expect(component.foundVersions[0].modes).toEqual([
      { name: '6-channel', shortName: '6ch', badge: { state: 'confirmed', count: 2 }, key: 'designer.fixture-library.state-confirmed' },
      { name: '3ch', shortName: '3ch', badge: undefined, key: undefined },
    ]);
    expect(element().textContent).toContain('designer.fixture-ai.found');

    // a version taken at once, in one of its modes or as it is
    (element().querySelector('.fixture-ai-use-mode') as HTMLElement).click();
    (element().querySelector('.fixture-ai-use') as HTMLElement).click();

    expect(closed).toEqual([
      { uuid: 'acme/par~1', mode: '6ch' },
      { uuid: 'acme/par~1', mode: undefined },
    ]);
    expect(hide).toHaveBeenCalledTimes(2);
  });

  it('lists a version found without modes it tells about', async () => {
    ai.lookup.and.returnValue(of({ versions: [{ uuid: 'acme/par~1', name: 'Par' }], manualKnown: true }));
    open();
    fill();

    await component.lookUp();

    expect(component.foundVersions).toEqual([{ version: { uuid: 'acme/par~1', name: 'Par' }, modes: [] }]);
  });

  it('reviews the channels a mode repeats for every pixel once, numbering the ones after them on', () => {
    ai.generate.and.returnValue(of({ ...response(), profile: JSON.parse(JSON.stringify(profiles['chauvet-dj/colorband-pix'])) }));
    open();
    fill();
    component.mode = '6ch';
    component.view = 'found';

    component.generate();

    expect(component.reviewMode.channels.map((channel) => [channel.name, channel.perPixel])).toEqual([
      ['Red $pixelKey', true],
      ['Green $pixelKey', true],
      ['Blue $pixelKey', true],
    ]);
  });

  it('looks a new manufacturer up by the model, and a link or a search without a manual', async () => {
    ai.lookup.and.returnValue(of({ versions: undefined, manualKnown: false }));

    open();
    component.manufacturerShortName = FixtureAiComponent.newManufacturer;
    component.manufacturerName = 'Lumen';
    component.model = 'Spot';
    component.setSource('search');

    await component.lookUp();
    fixture.detectChanges();

    expect(ai.sha256).not.toHaveBeenCalled();
    expect(ai.lookup).toHaveBeenCalledWith('', 'Spot', '');
    expect(component.foundVersions).toEqual([]);
    expect(element().textContent).toContain('designer.fixture-ai.not-found');
  });

  it('looks up without the hash of the manual where the browser has no cryptography', async () => {
    ai.sha256.and.returnValue(Promise.resolve(undefined));
    open();
    fill();

    await component.lookUp();

    expect(ai.lookup).toHaveBeenCalledWith('acme', 'Par', '');
  });

  it('tells what went wrong with the lookup and goes back to the inputs', async () => {
    ai.lookup.and.returnValue(throwError(new HttpErrorResponse({ status: 503, error: { error: 'ai-busy' } })));
    open();
    fill();

    await component.lookUp();
    fixture.detectChanges();

    expect(component.view).toBe('input');
    expect(component.error).toEqual({ key: 'designer.fixture-ai.error.ai-busy' });
    expect(element().querySelector('.fixture-ai-error')).not.toBeNull();
  });

  it("doesn't look up while it is not available or incomplete", async () => {
    ai.getStatus.and.returnValue(of({ available: false }));
    open();
    fill();

    await component.lookUp();
    component.generate();

    expect(ai.lookup).not.toHaveBeenCalled();
    expect(ai.generate).not.toHaveBeenCalled();
    expect(component.requestsLeft).toBeUndefined();
    expect(element().textContent).toContain('designer.fixture-ai.unavailable');
  });

  it('has the AI make the profile, waiting minutes, and shows the review of it', fakeAsync(() => {
    const answer = new Subject<AiFixturesResponse>();
    ai.generate.and.returnValue(answer);
    open();
    fill();
    component.mode = ' 6ch ';
    component.lookUp();
    flushMicrotasks();
    fixture.detectChanges();

    (element().querySelector('.fixture-ai-generate') as HTMLElement).click();
    fixture.detectChanges();

    expect(component.view).toBe('generating');
    expect(ai.generate).toHaveBeenCalledWith({ mode: '6ch', manufacturerShortName: 'acme', model: 'Par', manual: component.manual });

    tick(65000);
    fixture.detectChanges();
    expect(component.elapsed).toBe('1:05');
    expect(element().textContent).toContain('1:05');

    answer.next(response());
    fixture.detectChanges();
    tick(5000);

    expect(component.elapsed).toBe('1:05');
    expect(component.view).toBe('review');
    expect(component.requestsLeft).toBe(3);
    expect(component.reviewMode.shortName).toBe('6ch');
    expect(component.reviewModes.map((mode) => mode.shortName)).toEqual(['6ch', '3ch']);
    expect(element().querySelector('.fixture-ai-uncertain').textContent).toContain('The dimmer curve');
    expect(element().querySelector('.fixture-ai-unverified')).not.toBeNull();
    expect(element().querySelectorAll('.fixture-ai-review tbody tr').length).toBe(6);
  }));

  it('reviews the first mode, where the user asked for none', () => {
    open();
    fill();
    component.view = 'found';

    component.generate();

    expect(component.reviewMode.shortName).toBe('6ch');
  });

  it('adds the profile made to the project once, and hands it to the pool in the mode reviewed', () => {
    open();
    fill();
    component.view = 'found';
    component.generate();
    component.reviewMode = component.reviewModes[1];

    component.add();

    expect(project.fixtureProfiles.length).toBe(1);
    expect(project.fixtureProfiles[0].uuid).toBe('acme/par~2');
    expect(project.fixtureProfiles[0].origin).toBe('ai');
    expect(closed).toEqual([{ profile: project.fixtureProfiles[0], mode: '3ch' }]);

    component.add();
    expect(project.fixtureProfiles.length).toBe(1);
    expect(closed[1].profile).toBe(project.fixtureProfiles[0]);
  });

  it('asks for a link or a search with the manufacturer of the library, or a new one by its name', () => {
    open();
    component.manufacturerShortName = FixtureAiComponent.newManufacturer;
    component.manufacturerName = ' Lumen ';
    component.model = 'Spot';
    component.setSource('link');
    component.link = ' https://example.com/spot.pdf ';

    expect(component.getRequest()).toEqual({ manufacturerName: 'Lumen', model: 'Spot', link: 'https://example.com/spot.pdf' });

    component.setSource('search');
    expect(component.getRequest()).toEqual({ manufacturerName: 'Lumen', model: 'Spot' });
  });

  it('tells what went wrong with the AI and goes back to where it was, with what was still wrong', () => {
    ai.generate.and.returnValue(
      throwError(new HttpErrorResponse({ status: 502, error: { error: 'ai-invalid-profile', errors: ['Mode 6ch lists 7 channels'] } }))
    );
    open();
    fill();
    component.view = 'found';

    component.generate();
    fixture.detectChanges();

    expect(component.view).toBe('found');
    expect(component.error.errors).toEqual(['Mode 6ch lists 7 channels']);
    expect(element().querySelector('.fixture-ai-error').textContent).toContain('Mode 6ch lists 7 channels');
  });

  it('tells the user to log in again, or to link the device, when the status is refused', () => {
    ai.getStatus.and.returnValue(throwError(new HttpErrorResponse({ status: 401, error: { error: 'unauthorized' } })));
    open();

    expect(component.available).toBe(false);
    expect(component.error).toEqual({ key: 'designer.fixture-ai.log-in' });
    expect(logout).toHaveBeenCalled();

    TestBed.inject(ConfigService).aiAccount = 'host';
    open();
    expect(component.error).toEqual({ key: 'designer.account.link-device' });
  });

  it('has no request left once the user made all of today', () => {
    ai.getStatus.and.returnValue(of({ available: true, requestsLast24Hours: 5, requestsPerUserPerDay: 5 }));
    open();
    fill();
    component.view = 'found';

    expect(component.canGenerate).toBe(false);

    ai.getStatus.and.returnValue(of({ available: true, requestsPerUserPerDay: 5 }));
    open();
    expect(component.requestsLeft).toBe(5);
  });

  it('improves a version found, or the one it was opened for, as the user says', () => {
    open();
    fill();
    component.view = 'found';

    component.improveFound(found);
    fixture.detectChanges();

    expect(component.parent).toBe(found);
    expect(component.view).toBe('input');
    expect(element().textContent).toContain('designer.fixture-ai.improve-intro');
    expect(component.complete).toBe(false);

    component.instruction = ' Channel 6 is the strobe ';
    fixture.detectChanges();
    footerButton().click();

    expect(ai.lookup).not.toHaveBeenCalled();
    expect(ai.generate).toHaveBeenCalledWith({ parentUuid: 'acme/par~1', instruction: 'Channel 6 is the strobe' });
    expect(component.view).toBe('review');
  });

  it('asks for no manufacturers to improve a version', () => {
    open(found);

    expect(manufacturers).not.toHaveBeenCalled();
    expect(element().querySelector('#fixtureAiInstruction')).not.toBeNull();
  });

  it('goes back to the inputs, and closes without a profile', () => {
    open();
    component.view = 'found';
    component.error = { key: 'x' };
    fixture.detectChanges();

    (element().querySelector('.modal-footer a') as HTMLElement).click();
    expect(component.view).toBe('input');
    expect(component.error).toBeUndefined();

    (element().querySelector('.modal-header .close') as HTMLElement).click();
    expect(closed).toEqual([undefined]);
    expect(hide).toHaveBeenCalled();
  });

  it('stops the clock of the AI at work when it is closed', fakeAsync(() => {
    ai.generate.and.returnValue(new Subject());
    open();
    fill();
    component.view = 'found';
    component.generate();
    tick(2000);

    fixture.destroy();
    tick(2000);

    expect(component.elapsedSeconds).toBe(2);
    discardPeriodicTasks();
  }));
});
