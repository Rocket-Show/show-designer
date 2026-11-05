import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';

import { ErrorDialogComponent } from './error-dialog.component';

// The error dialog says what went wrong (e.g. a project which can't be opened), with the
// details the server gave, and is closed with OK.
describe('ErrorDialogComponent', () => {
  let fixture: ComponentFixture<ErrorDialogComponent>;
  let hide: jasmine.Spy;
  let answers: number[];

  function open(message: string, details?: string) {
    fixture.componentInstance.message = message;
    fixture.componentInstance.details = details;
    fixture.detectChanges();
  }

  function paragraphs(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.card-body p')).map((p: HTMLElement) => p.textContent.trim());
  }

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [ErrorDialogComponent],
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }],
    });

    fixture = TestBed.createComponent(ErrorDialogComponent);
    fixture.detectChanges();

    answers = [];
    fixture.componentInstance.onClose.subscribe((answer) => answers.push(answer));
  });

  it('shows the error with its details in brackets', () => {
    open('The project could not be opened.', 'not-found');

    expect(paragraphs()).toEqual(['The project could not be opened.', '(not-found)']);
  });

  it('leaves the brackets away without details', () => {
    open('A project has to be saved before it can be shared.');

    expect(paragraphs()).toEqual(['A project has to be saved before it can be shared.']);
  });

  it('is closed with OK or the enter key', () => {
    open('Error');

    fixture.nativeElement.querySelector('button.btn-primary').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(answers).toEqual([1, 1]);
    expect(hide).toHaveBeenCalledTimes(2);
  });

  it('tells a cancel from an OK', () => {
    fixture.componentInstance.cancel();

    expect(answers).toEqual([2]);
    expect(hide).toHaveBeenCalled();
  });
});
