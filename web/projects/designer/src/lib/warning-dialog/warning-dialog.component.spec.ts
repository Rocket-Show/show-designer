import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';

import { WarningDialogComponent } from './warning-dialog.component';

// The warning asks before something which can't be undone (e.g. dropping the unsaved
// changes): OK goes ahead, cancel doesn't.
describe('WarningDialogComponent', () => {
  let fixture: ComponentFixture<WarningDialogComponent>;
  let hide: jasmine.Spy;
  let answers: number[];

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [WarningDialogComponent],
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }],
    });

    fixture = TestBed.createComponent(WarningDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.message = 'Your changes will be lost.';
    fixture.detectChanges();

    answers = [];
    fixture.componentInstance.onClose.subscribe((answer) => answers.push(answer));
  });

  it('shows the warning', () => {
    expect(fixture.nativeElement.querySelector('.card-body').textContent).toContain('Your changes will be lost.');
  });

  it('goes ahead with OK', () => {
    fixture.nativeElement.querySelector('button.btn-primary').click();

    expect(answers).toEqual([1]);
    expect(hide).toHaveBeenCalled();
  });

  it('goes ahead with the enter key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(answers).toEqual([1]);
    expect(hide).toHaveBeenCalled();
  });

  it('stays put with cancel', () => {
    fixture.nativeElement.querySelector('.card-footer a').click();

    expect(answers).toEqual([2]);
    expect(hide).toHaveBeenCalled();
  });
});
