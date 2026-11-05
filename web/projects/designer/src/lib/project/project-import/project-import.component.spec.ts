import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { DropzoneDirective, DropzoneModule } from 'ngx-dropzone-wrapper';
import { ToastrModule, ToastrService } from 'ngx-toastr';

import { ProjectLoadService } from '../../services/project-load.service';
import { ProjectImportComponent } from './project-import.component';

// The import opens a project exported before (an .rsd file) which is dropped onto it.
describe('ProjectImportComponent', () => {
  let fixture: ComponentFixture<ProjectImportComponent>;
  let hide: jasmine.Spy;
  let imported: Promise<string>;
  let toastError: jasmine.Spy;

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [ProjectImportComponent],
      imports: [DropzoneModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        BsModalService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    });

    // the wrapper of Dropzone logs the options of each Dropzone it creates
    spyOn(console, 'log');

    const projectLoadService = TestBed.inject(ProjectLoadService);
    imported = new Promise((resolve) => spyOn(projectLoadService, 'import').and.callFake(resolve));
    toastError = spyOn(TestBed.inject(ToastrService), 'error');

    fixture = TestBed.createComponent(ProjectImportComponent);
    fixture.detectChanges();
  });

  // the Dropzone the file is dropped onto
  function dropzone(): any {
    return fixture.debugElement.query(By.directive(DropzoneDirective)).injector.get(DropzoneDirective).dropzone();
  }

  it('takes a show file of up to 10 MB', () => {
    expect(dropzone().options.acceptedFiles).toBe('.rsd');
    expect(dropzone().options.maxFilesize).toBe(10);
    expect(fixture.nativeElement.querySelector('.dz-text').textContent).toBe('designer.misc.dropzone-message');
  });

  it('opens the project in the file dropped, and closes', async () => {
    // the wrapper of Dropzone hands its events on from the next turn on
    await fixture.whenStable();
    const json = JSON.stringify({ name: 'Rock', version: 10 });

    dropzone().addFile(new File([json], 'rock.rsd'));

    expect(await imported).toBe(json);
    expect(hide).toHaveBeenCalled();
    // the file isn't uploaded anywhere, which Dropzone reports as an error
    expect(toastError).not.toHaveBeenCalled();
  });

  it('says why a file has been turned down', async () => {
    await fixture.whenStable();

    dropzone().addFile(new File(['notes'], 'notes.txt'));

    expect(toastError).toHaveBeenCalledWith(
      "designer.misc.toast-upload-errorYou can't upload files of this type.",
      'designer.misc.toast-upload-error-title',
      { timeOut: 0, extendedTimeOut: 0, enableHtml: true }
    );
    expect(hide).not.toHaveBeenCalled();
  });

  it('is closed with OK, the enter key, its close button or a cancel', () => {
    fixture.nativeElement.querySelector('.modal-footer button').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.nativeElement.querySelector('button.close').click();
    fixture.componentInstance.cancel();

    expect(hide).toHaveBeenCalledTimes(4);
  });
});
