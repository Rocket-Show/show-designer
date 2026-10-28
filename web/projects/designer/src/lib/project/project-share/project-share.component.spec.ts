import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { Project } from '../../models/project';
import { ProjectService } from '../../services/project.service';
import { ProjectShareComponent } from './project-share.component';

// The share dialog hands out the link of a saved project to be copied, and says what's
// missing instead of showing a link which can't work.
describe('ProjectShareComponent', () => {
  let fixture: ComponentFixture<ProjectShareComponent>;

  function open(id: number, shareToken: string) {
    TestBed.configureTestingModule({
      declarations: [ProjectShareComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide: () => {} } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    const project = new Project();
    project.id = id;
    project.shareToken = shareToken;
    TestBed.inject(ProjectService).project = project;

    fixture = TestBed.createComponent(ProjectShareComponent);
    fixture.detectChanges();
  }

  it('shows the full link of the project with its token, to be selected', () => {
    open(42, 'abc123');

    expect(fixture.componentInstance.shareLink).toBe(window.location.origin + '/designer/app?id=42&token=abc123');
    expect(fixture.nativeElement.querySelector('input').classList).toContain('selectable');
  });

  it('asks to save a project without a share token instead of showing its link', () => {
    open(42, undefined);

    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('designer.project.share-no-token');
  });

  it('copies the link', async () => {
    open(42, 'abc123');
    const writeText = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    fixture.componentInstance.copyShareLink();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(fixture.componentInstance.shareLink);
    expect(fixture.componentInstance.copied).toBe(true);
  });
});
