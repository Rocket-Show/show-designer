import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of, throwError } from 'rxjs';

import { FixtureProfile } from '../../models/fixture-profile';
import { Project } from '../../models/project';
import { ConfigService } from '../../services/config.service';
import { FixtureLibraryService } from '../../services/fixture-library.service';
import { ProjectService } from '../../services/project.service';
import { UserService } from '../../services/user.service';
import { FixtureOfferComponent } from './fixture-offer.component';

// "Offer to the library": the file of a profile created from a file becomes a version of the library from a user, of a
// manufacturer of the library or a new one, and goes into the project.
describe('FixtureOfferComponent', () => {
  let fixture: ComponentFixture<FixtureOfferComponent>;
  let component: FixtureOfferComponent;
  let project: Project;
  let library: { files: Map<string, any>; getManufacturers: jasmine.Spy; offer: jasmine.Spy };
  let hide: jasmine.Spy;
  let logout: jasmine.Spy;
  let closed: FixtureProfile[];
  let profile: FixtureProfile;

  const file = { name: 'Par 64', manufacturerKey: 'acme', fixtureKey: 'par-64', modes: [{ name: '6-channel', channels: [] }] };

  beforeEach(() => {
    hide = jasmine.createSpy('hide');
    logout = jasmine.createSpy('logout');
    library = {
      files: new Map(),
      getManufacturers: jasmine.createSpy('getManufacturers').and.returnValue(of([{ shortName: 'acme', name: 'Acme' }])),
      offer: jasmine.createSpy('offer').and.returnValue(of({ version: { uuid: 'acme/par-64~7', origin: 'user', state: 'open' } })),
    };

    TestBed.configureTestingModule({
      declarations: [FixtureOfferComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: BsModalService, useValue: {} },
        { provide: FixtureLibraryService, useValue: library },
        { provide: UserService, useValue: { logout, isLoggedIn: () => true } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    profile = new FixtureProfile({ uuid: 'acme/par-64', name: 'Par 64', manufacturerShortName: 'acme', manufacturerName: 'acme' });
    profile.createdFromFile = true;
    project = new Project({ fixtureProfiles: [profile] });
    TestBed.inject(ProjectService).project = project;
    closed = [];
  });

  function open() {
    fixture = TestBed.createComponent(FixtureOfferComponent);
    component = fixture.componentInstance;
    component.profile = project.fixtureProfiles[0];
    component.onClose.subscribe((version) => closed.push(version));
    fixture.detectChanges();
  }

  const element = (): HTMLElement => fixture.nativeElement;

  it('offers the file read in this session, of the manufacturer of the library, and adds the version to the project', () => {
    library.files.set('acme/par-64', file);
    open();

    expect(component.manufacturerShortName).toBe('acme');
    expect(element().querySelector('#fixtureOfferFile')).toBeNull();
    expect(component.canOffer).toBe(true);

    (element().querySelector('.fixture-offer-send') as HTMLElement).click();

    expect(library.offer).toHaveBeenCalledWith(file, 'acme', undefined);

    const version = project.fixtureProfiles[1];
    expect(version.uuid).toBe('acme/par-64~7');
    expect(version.origin).toBe('user');
    expect(version.name).toBe('Par 64');
    expect(closed).toEqual([version]);
    expect(hide).toHaveBeenCalled();
  });

  it('takes the version the project has already', () => {
    library.files.set('acme/par-64', file);
    const existing = new FixtureProfile({ uuid: 'acme/par-64~7' });
    project.fixtureProfiles.push(existing);
    open();

    component.offer();

    expect(project.fixtureProfiles.length).toBe(2);
    expect(closed).toEqual([existing]);
  });

  it('offers it as of a new manufacturer, where the library has none of the key of the file', () => {
    library.files.set('acme/par-64', file);
    library.getManufacturers.and.returnValue(of([{ shortName: 'other', name: 'Other' }]));
    open();

    expect(component.newManufacturer).toBe(true);
    expect(component.manufacturerName).toBe('acme');

    component.manufacturerName = ' ';
    expect(component.canOffer).toBe(false);
    component.manufacturerName = ' Acme Lighting ';
    component.offer();

    expect(library.offer).toHaveBeenCalledWith(file, undefined, 'Acme Lighting');
  });

  it('offers it as of a new manufacturer when the list could not be loaded', () => {
    library.getManufacturers.and.returnValue(throwError(new Error('offline')));
    project.fixtureProfiles[0].manufacturerName = undefined;

    open();

    expect(component.newManufacturer).toBe(true);
    expect(component.manufacturerName).toBe('');
  });

  it('asks for the file again after a reload, and takes the one of this profile only', async () => {
    open();

    expect(component.canOffer).toBe(false);
    expect(element().querySelector('#fixtureOfferFile')).not.toBeNull();

    await component.setFile(new File([JSON.stringify({ ...file, fixtureKey: 'par-56' })], 'par-56.json'));
    expect(component.errorKey).toBe('designer.fixture-offer.wrong-file');
    expect(component.file).toBeUndefined();

    await component.setFile(new File(['no json'], 'par.json'));
    expect(component.errorKey).toBe('designer.fixture-offer.wrong-file');

    await component.setFile(undefined);
    expect(component.errorKey).toBeUndefined();

    await component.setFile(new File([JSON.stringify(file)], 'par-64.json'));
    expect(component.errorKey).toBeUndefined();
    expect(component.file).toEqual(file);
    expect(library.files.get('acme/par-64')).toEqual(file);

    component.manufacturerShortName = '';
    expect(component.canOffer).toBe(false);
    component.offer();
    expect(library.offer).not.toHaveBeenCalled();
  });

  it('lists what the library found wrong with the profile', () => {
    library.files.set('acme/par-64', file);
    library.offer.and.returnValue(
      throwError(new HttpErrorResponse({ status: 422, error: { error: 'invalid-profile', errors: ['Mode 6-channel has no channels'] } }))
    );
    open();

    component.offer();
    fixture.detectChanges();

    expect(component.sending).toBe(false);
    expect(component.errorKey).toBe('designer.fixture-offer.invalid-profile');
    expect(element().querySelector('.fixture-offer-error').textContent).toContain('Mode 6-channel has no channels');

    library.offer.and.returnValue(throwError(new HttpErrorResponse({ status: 422, error: { error: 'invalid-profile' } })));
    component.offer();
    expect(component.errors).toEqual([]);
  });

  it('tells the user to log in again or to link the device, and what else went wrong', () => {
    library.files.set('acme/par-64', file);
    library.offer.and.returnValue(throwError(new HttpErrorResponse({ status: 401, error: { error: 'unauthorized' } })));
    open();

    component.offer();
    expect(component.errorKey).toBe('designer.fixture-offer.log-in');
    expect(logout).toHaveBeenCalled();

    TestBed.inject(ConfigService).aiAccount = 'host';
    component.offer();
    expect(component.errorKey).toBe('designer.account.link-device');

    library.offer.and.returnValue(throwError(new HttpErrorResponse({ status: 500, error: 'oops' })));
    component.offer();
    expect(component.errorKey).toBe('designer.fixture-offer.failed');
    expect(closed).toEqual([]);
  });

  it('closes without a version', () => {
    open();

    (element().querySelector('.modal-header .close') as HTMLElement).click();

    expect(closed).toEqual([undefined]);
    expect(hide).toHaveBeenCalled();
  });
});
