import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';

import { Project } from '../../models/project';
import { ConfigService } from '../../services/config.service';
import { ProjectService } from '../../services/project.service';
import { ProjectShareComponent } from './project-share.component';

// The share dialog hands out the link of a saved project to be copied, and says what's
// missing instead of showing a link which can't work.
describe('ProjectShareComponent', () => {
  let fixture: ComponentFixture<ProjectShareComponent>;
  let hide: jasmine.Spy;

  function open(id: number, shareToken: string, hardwarePromo = false) {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [ProjectShareComponent],
      imports: [FormsModule, PopoverModule.forRoot(), TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }, provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    const project = new Project();
    project.id = id;
    project.shareToken = shareToken;
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(ConfigService).hardwarePromo = hardwarePromo;

    fixture = TestBed.createComponent(ProjectShareComponent);
    fixture.detectChanges();
  }

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  function copyIcon(): HTMLElement {
    return fixture.nativeElement.querySelector('button.share-copy i');
  }

  it('shows the full link of the project with its token, to be selected', () => {
    open(42, 'abc123');

    expect(fixture.componentInstance.shareLink).toBe(window.location.origin + '/designer/app?id=42&token=abc123');
    expect(fixture.nativeElement.querySelector('input').classList).toContain('selectable');
  });

  it('offers a small button with an icon to copy the link', () => {
    open(42, 'abc123');

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.share-copy');
    expect(button.classList).toContain('btn-sm');
    expect(button.textContent.trim()).toBe('');
    expect(button.querySelector('i.fa-clipboard')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('designer.project.share-copy');
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
    expect(fixture.nativeElement.querySelector('button.share-copy i.fa-check')).not.toBeNull();
  });

  it('selects the whole link when it is clicked into', async () => {
    open(42, 'abc123');
    await fixture.whenStable();

    input().click();

    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(fixture.componentInstance.shareLink.length);
  });

  it('copies the selected link the old way, where the browser keeps the clipboard to itself', async () => {
    open(42, 'abc123');
    await fixture.whenStable();
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new Error('denied')));
    const execCommand = spyOn(document, 'execCommand').and.returnValue(true);

    fixture.nativeElement.querySelector('button.share-copy').click();
    await fixture.whenStable();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(input().selectionEnd - input().selectionStart).toBe(fixture.componentInstance.shareLink.length);
    expect(copyIcon().classList).toContain('fa-check');
  });

  // a Rocket Show device serves the designer without https
  it('copies the selected link the old way on a page which is not secure', async () => {
    open(42, 'abc123');
    spyOnProperty(window, 'isSecureContext').and.returnValue(false);
    const writeText = spyOn(navigator.clipboard, 'writeText');
    spyOn(document, 'execCommand').and.returnValue(true);

    fixture.componentInstance.copyShareLink();

    expect(writeText).not.toHaveBeenCalled();
    expect(copyIcon().classList).toContain('fa-check');
  });

  it('keeps offering to copy, when the link could not be copied at all', async () => {
    open(42, 'abc123');
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new Error('denied')));
    spyOn(document, 'execCommand').and.returnValue(false);

    fixture.componentInstance.copyShareLink();
    await fixture.whenStable();

    expect(fixture.componentInstance.copied).toBe(false);
    expect(copyIcon().classList).toContain('fa-clipboard');
  });

  it('mentions the hardware to play the show on, in the free online designer only', () => {
    open(42, 'abc123');

    expect(fixture.nativeElement.querySelector('.hardware-promo-hint')).toBeNull();

    TestBed.resetTestingModule();
    open(42, 'abc123', true);

    const hint: HTMLElement = fixture.nativeElement.querySelector('.hardware-promo-hint');
    expect(hint.textContent).toContain('designer.hardware-promo.share-hint');
    expect(hint.querySelector('a').href).toContain('utm_content=share');
  });

  it('is closed with OK, the enter key, its close button or a cancel', () => {
    open(42, 'abc123');

    fixture.nativeElement.querySelector('.modal-footer button').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.nativeElement.querySelector('button.close').click();
    fixture.componentInstance.cancel();

    expect(hide).toHaveBeenCalledTimes(4);
  });
});
