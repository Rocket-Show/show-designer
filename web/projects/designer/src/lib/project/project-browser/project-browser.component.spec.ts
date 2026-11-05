import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService, MODAL_CONFIG_DEFAULT_OVERRIDE } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of, throwError } from 'rxjs';

import { ArraySortPipe } from '../../array-sort-pipe';
import { ErrorDialogComponent } from '../../error-dialog/error-dialog.component';
import { ProjectLoadService } from '../../services/project-load.service';
import { WarningDialogComponent } from '../../warning-dialog/warning-dialog.component';
import { ProjectBrowserComponent } from './project-browser.component';

// The project browser opens a project saved before, which the designer opens again the next
// time, and deletes saved projects.
describe('ProjectBrowserComponent', () => {
  const keys = ['projectId', 'projectName'];
  let fixture: ComponentFixture<ProjectBrowserComponent>;
  let http: HttpTestingController;
  let load: jasmine.Spy;
  let hide: jasmine.Spy;

  function clearStorage() {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  beforeEach(() => {
    clearStorage();
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [ProjectBrowserComponent, ArraySortPipe, WarningDialogComponent, ErrorDialogComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        // the warnings and errors are shown on top of the dialog, like in the designer
        BsModalService,
        { provide: MODAL_CONFIG_DEFAULT_OVERRIDE, useValue: { animated: false } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    http = TestBed.inject(HttpTestingController);
    load = spyOn(TestBed.inject(ProjectLoadService), 'load').and.returnValue(of(undefined));

    fixture = TestBed.createComponent(ProjectBrowserComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    document.querySelectorAll('modal-container, bs-modal-backdrop').forEach((element) => element.remove());
    document.body.classList.remove('modal-open');
    clearStorage();
  });

  function flushProjects(projects: any[]) {
    http.expectOne('projects').flush(projects);
    fixture.detectChanges();
  }

  function listed(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.list-group-item'));
  }

  // the warning or the error shown on top of the dialog
  function dialog(): HTMLElement {
    TestBed.inject(ApplicationRef).tick();
    return document.querySelector('modal-container');
  }

  function answer(ok: boolean) {
    dialog()
      .querySelector<HTMLElement>(ok ? 'button.btn-primary' : '.card-footer a')
      .click();
    fixture.detectChanges();
  }

  it('lists the projects saved so far by name, once they are loaded', () => {
    expect(fixture.nativeElement.querySelector('.fa-spinner')).not.toBeNull();

    flushProjects([
      { id: 1, name: 'Rock' },
      { id: 2, name: 'Ballad' },
    ]);

    expect(fixture.nativeElement.querySelector('.fa-spinner')).toBeNull();
    expect(listed().map((item) => item.textContent.trim())).toEqual(['Ballad', 'Rock']);
    expect(fixture.nativeElement.textContent).not.toContain('designer.project.browser-empty');
  });

  it('says so, when there is no project yet', () => {
    flushProjects([]);

    expect(fixture.nativeElement.textContent).toContain('designer.project.browser-empty');
  });

  it('opens the project clicked, again the next time the designer is opened', () => {
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector('a').click();

    expect(hide).toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(2, 'Ballad');
    expect(localStorage.getItem('projectId')).toBe('2');
    expect(localStorage.getItem('projectName')).toBe('Ballad');
  });

  it("says why a project couldn't be opened", () => {
    load.and.returnValue(throwError(new HttpErrorResponse({ status: 404, error: { error: 'not-found' } })));
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector('a').click();

    expect(dialog().textContent).toContain('designer.project.open-error');
    expect(dialog().textContent).toContain('(not-found)');
    expect(localStorage.getItem('projectId')).toBeNull();
  });

  it('deletes a project after asking, and lists the projects again', () => {
    flushProjects([
      { id: 2, name: 'Rock & Roll' },
      { id: 3, name: 'Ballad' },
    ]);

    listed()[1].querySelector<HTMLElement>('.text-danger').click();

    expect(dialog().textContent).toContain('designer.project.delete-warning');

    answer(true);
    http.expectOne({ method: 'DELETE', url: 'project?id=2&name=Rock%20%26%20Roll' }).flush(null);
    flushProjects([{ id: 3, name: 'Ballad' }]);

    expect(listed().map((item) => item.textContent.trim())).toEqual(['Ballad']);
  });

  it('keeps a project, if the user says so', () => {
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector<HTMLElement>('.text-danger').click();
    answer(false);

    http.expectNone('project?id=2&name=Ballad');
    expect(listed().length).toBe(1);
  });

  it('is closed without opening anything', () => {
    flushProjects([{ id: 2, name: 'Ballad' }]);

    fixture.nativeElement.querySelector('button.close').click();
    fixture.nativeElement.querySelector('.modal-footer a').click();
    fixture.nativeElement.querySelector('.modal-footer button').click();

    expect(hide).toHaveBeenCalledTimes(3);
    expect(load).not.toHaveBeenCalled();
  });
});
