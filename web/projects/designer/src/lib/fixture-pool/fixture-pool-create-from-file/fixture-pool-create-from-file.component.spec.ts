import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule, ToastrService } from 'ngx-toastr';

import { profiles } from '../../../../conformance/index';
import { FixtureProfile } from '../../models/fixture-profile';
import { Project } from '../../models/project';
import { ProjectService } from '../../services/project.service';
import { FixturePoolCreateFromFileComponent } from './fixture-pool-create-from-file.component';

// A fixture from a profile file of the open fixture library, which is not in the library
// (yet): the dropped file becomes a profile of the project, and the pool adds a fixture of it.
describe('FixturePoolCreateFromFileComponent', () => {
  let fixture: ComponentFixture<FixturePoolCreateFromFileComponent>;
  let component: FixturePoolCreateFromFileComponent;
  let project: Project;
  let hide: jasmine.Spy;
  let error: jasmine.Spy;
  let closed: FixtureProfile[];

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [FixturePoolCreateFromFileComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }, provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      // the dropzone itself is not part of what is tested here
      schemas: [NO_ERRORS_SCHEMA],
    });

    project = new Project();
    TestBed.inject(ProjectService).project = project;
    error = spyOn(TestBed.inject(ToastrService), 'error');

    fixture = TestBed.createComponent(FixturePoolCreateFromFileComponent);
    component = fixture.componentInstance;

    closed = [];
    component.onClose.subscribe((profile) => closed.push(profile));

    fixture.detectChanges();
  });

  // a profile file as the fixture editor of the library writes it
  function profileFile(schema = 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/schemas/fixture.json') {
    return JSON.stringify({ $schema: schema, ...profiles['test/rgb-par'], manufacturerKey: 'acme', fixtureKey: 'par-64' });
  }

  // drop a file onto the dropzone, until it is done with it
  function drop(content: string): Promise<any> {
    return new Promise((resolve) => component.dropzoneConfig.accept(new File([content], 'profile.json'), resolve));
  }

  it('takes a single profile file of the library', () => {
    expect(component.dropzoneConfig.acceptedFiles).toBe('.json');
    expect(component.dropzoneConfig.maxFilesize).toBe(10);
    expect(component.uploadMessage).toContain('designer.misc.dropzone-message');
  });

  it('adds the profile of the file to the project and hands it to the pool', async () => {
    expect(await drop(profileFile())).toBe('noerr');

    expect(project.fixtureProfiles.length).toBe(1);

    const profile = project.fixtureProfiles[0];

    expect(profile.uuid).toBe('acme/par-64');
    expect(profile.name).toBe('RGB par');
    expect(profile.manufacturerShortName).toBe('acme');
    expect(profile.manufacturerName).toBe('acme');
    expect(profile.createdFromFile).toBe(true);
    expect(profile.modes[0].shortName).toBe('6ch');
    expect(closed).toEqual([profile]);
    expect(hide).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('takes the file of a released schema as well', async () => {
    await drop(
      profileFile('https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/schema-12.1.0/schemas/fixture.json')
    );

    expect(closed.map((profile) => profile.uuid)).toEqual(['acme/par-64']);
  });

  it('adds a profile which is in the project already only once', async () => {
    await drop(profileFile());
    await drop(profileFile());

    expect(project.fixtureProfiles.length).toBe(1);
    expect(closed.length).toBe(2);
  });

  it('says so, when the file is no profile of the library', async () => {
    for (const content of [profileFile('https://example.com/schema.json'), JSON.stringify({ name: 'no schema' }), 'no json at all']) {
      expect(await drop(content)).toBe('noerr');
    }

    expect(error).toHaveBeenCalledTimes(3);
    expect(error.calls.argsFor(0)[0]).toBe('designer.fixture-pool.invalid-fixture-profile-file');
    expect(project.fixtureProfiles).toEqual([]);
    expect(closed).toEqual([]);
    expect(hide).not.toHaveBeenCalled();
  });

  it('shows the error of a failed upload, but not the one it uses to stop the upload', () => {
    component.onUploadError([undefined, 'noerr']);

    expect(error).not.toHaveBeenCalled();

    component.onUploadError([undefined, 'File is too big']);

    expect(error).toHaveBeenCalled();
    expect(error.calls.argsFor(0)[0]).toBe('designer.misc.toast-upload-errorFile is too big');
  });

  it('closes without a profile on OK, cancel and enter', () => {
    fixture.nativeElement.querySelector('.modal-footer button').click();
    component.cancel();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(closed).toEqual([undefined, undefined, undefined]);
    expect(hide).toHaveBeenCalledTimes(3);

    // the cross closes it without a word
    fixture.nativeElement.querySelector('.modal-header button.close').click();

    expect(closed.length).toBe(3);
    expect(hide).toHaveBeenCalledTimes(4);
  });
});
