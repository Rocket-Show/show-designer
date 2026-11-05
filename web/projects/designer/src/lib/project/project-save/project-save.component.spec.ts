import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService, MODAL_CONFIG_DEFAULT_OVERRIDE } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { ArraySortPipe } from '../../array-sort-pipe';
import { Project } from '../../models/project';
import { ConfigService } from '../../services/config.service';
import { ProjectService } from '../../services/project.service';
import { WarningDialogComponent } from '../../warning-dialog/warning-dialog.component';
import { ProjectSaveComponent } from './project-save.component';

// The save dialog saves the project under a name, which can be the one of a project saved
// before, and deletes saved projects.
describe('ProjectSaveComponent', () => {
  let fixture: ComponentFixture<ProjectSaveComponent>;
  let http: HttpTestingController;
  let project: Project;
  let save: jasmine.Spy;
  let hide: jasmine.Spy;

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [ProjectSaveComponent, ArraySortPipe, WarningDialogComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        // the warnings are shown on top of the dialog, like in the designer
        BsModalService,
        { provide: MODAL_CONFIG_DEFAULT_OVERRIDE, useValue: { animated: false } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    http = TestBed.inject(HttpTestingController);
    project = new Project({ uuid: 'current', name: 'Rock' });
    TestBed.inject(ProjectService).project = project;
    save = spyOn(TestBed.inject(ProjectService), 'save');
  });

  afterEach(() => {
    http.verify();
    document.querySelectorAll('modal-container, bs-modal-backdrop').forEach((element) => element.remove());
    document.body.classList.remove('modal-open');
  });

  function open() {
    fixture = TestBed.createComponent(ProjectSaveComponent);
    fixture.detectChanges();
  }

  function flushProjects(projects: any[]) {
    http.expectOne('projects').flush(projects);
    fixture.detectChanges();
  }

  function nameInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  function okButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.modal-footer button');
  }

  function listed(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.list-group-item'));
  }

  function type(name: string) {
    nameInput().value = name;
    nameInput().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // the warning shown on top of the dialog
  function warning(): HTMLElement {
    TestBed.inject(ApplicationRef).tick();
    return document.querySelector('modal-container');
  }

  function answerWarning(ok: boolean) {
    warning()
      .querySelector<HTMLElement>(ok ? 'button.btn-primary' : '.card-footer a')
      .click();
    fixture.detectChanges();
  }

  it('lists the projects saved so far by name, once they are loaded', () => {
    open();

    expect(fixture.nativeElement.querySelector('.fa-spinner')).not.toBeNull();
    expect(okButton().disabled).toBe(true);

    flushProjects([
      { id: 1, name: 'Rock' },
      { id: 2, name: 'Ballad' },
    ]);

    expect(fixture.nativeElement.querySelector('.fa-spinner')).toBeNull();
    expect(listed().map((item) => item.textContent.trim())).toEqual(['Ballad', 'Rock']);
    expect(okButton().disabled).toBe(false);
  });

  it('suggests the name of the project, or a new one for a project never saved', async () => {
    open();
    flushProjects([]);
    await fixture.whenStable();

    expect(nameInput().value).toBe('Rock');

    project.name = undefined;
    open();
    flushProjects([]);
    await fixture.whenStable();

    expect(nameInput().value).toBe('New Project');
  });

  it('saves the project under the name typed in', () => {
    open();
    flushProjects([]);

    type('Punk');
    okButton().click();

    expect(project.name).toBe('Punk');
    expect(save).toHaveBeenCalledWith(project);
    expect(hide).toHaveBeenCalled();
  });

  it('saves with the enter key', () => {
    open();
    flushProjects([]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(save).toHaveBeenCalledWith(project);
  });

  it("can't save without a name", () => {
    open();
    flushProjects([]);

    type('');

    expect(okButton().disabled).toBe(true);
  });

  it('saves over a project clicked in the list', async () => {
    open();
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector('a').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(nameInput().value).toBe('Ballad');
    // the project itself is only renamed once it is saved
    expect(project.name).toBe('Rock');

    okButton().click();

    expect(project.name).toBe('Ballad');
    expect(save).toHaveBeenCalledWith(project);
  });

  it('leaves the project as it was when the dialog is cancelled', () => {
    open();
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector('a').click();
    fixture.nativeElement.querySelector('.modal-footer a').click();

    expect(hide).toHaveBeenCalled();
    expect(project.name).toBe('Rock');
    expect(save).not.toHaveBeenCalled();
  });

  it('is closed with its close button', () => {
    open();
    flushProjects([]);

    fixture.nativeElement.querySelector('button.close').click();

    expect(hide).toHaveBeenCalled();
  });

  describe('where each name stands for one project (on a Rocket Show device)', () => {
    beforeEach(() => {
      TestBed.inject(ConfigService).uniqueProjectNames = true;
    });

    it('asks before saving over another project', () => {
      open();
      flushProjects([{ id: 2, uuid: 'other', name: 'Ballad' }]);

      type('Ballad');
      okButton().click();

      expect(warning().textContent).toContain('designer.project.overwrite-warning');
      expect(save).not.toHaveBeenCalled();

      answerWarning(true);

      expect(save).toHaveBeenCalledWith(project);
      expect(project.name).toBe('Ballad');
    });

    it('keeps the other project, if the user says so', () => {
      open();
      flushProjects([{ id: 2, uuid: 'other', name: 'Ballad' }]);

      type('Ballad');
      okButton().click();
      answerWarning(false);

      expect(save).not.toHaveBeenCalled();
      expect(hide).not.toHaveBeenCalled();
    });

    it('answers the warning with the enter key, without saving twice', () => {
      open();
      flushProjects([{ id: 2, uuid: 'other', name: 'Ballad' }]);

      type('Ballad');
      okButton().click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(save).toHaveBeenCalledTimes(1);
      // no second warning popped up
      expect(document.querySelectorAll('modal-container').length).toBe(1);
    });

    it('saves the project under its own name again without asking', () => {
      open();
      flushProjects([{ id: 1, uuid: 'current', name: 'Rock' }]);

      okButton().click();

      expect(warning()).toBeNull();
      expect(save).toHaveBeenCalledWith(project);
    });
  });

  it("saves over another project without asking, where names needn't be unique", () => {
    open();
    flushProjects([{ id: 2, uuid: 'other', name: 'Ballad' }]);

    type('Ballad');
    okButton().click();

    expect(warning()).toBeNull();
    expect(save).toHaveBeenCalledWith(project);
  });

  it('deletes a project after asking, and lists the projects again', () => {
    open();
    flushProjects([
      { id: 2, name: 'Rock & Roll' },
      { id: 3, name: 'Ballad' },
    ]);

    listed()[1].querySelector<HTMLElement>('.text-danger').click();

    expect(warning().textContent).toContain('designer.project.delete-warning');

    answerWarning(true);
    http.expectOne({ method: 'DELETE', url: 'project?id=2&name=Rock%20%26%20Roll' }).flush(null);
    flushProjects([{ id: 3, name: 'Ballad' }]);

    expect(listed().map((item) => item.textContent.trim())).toEqual(['Ballad']);
  });

  it('keeps a project, if the user says so', () => {
    open();
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector<HTMLElement>('.text-danger').click();
    answerWarning(false);

    http.expectNone('project?id=2&name=Ballad');
    expect(listed().length).toBe(1);
  });

  // the enter key answers the warning, which is on top of the dialog
  it('deletes a project with the enter key, without saving the project as well', fakeAsync(() => {
    open();
    flushProjects([{ id: 2, name: 'Ballad' }]);

    listed()[0].querySelector<HTMLElement>('.text-danger').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    http.expectOne({ method: 'DELETE', url: 'project?id=2&name=Ballad' }).flush(null);
    flushProjects([]);
    expect(save).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();

    // the dialog saves with the enter key again, once the warning is gone
    tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(save).toHaveBeenCalledWith(project);
  }));
});
