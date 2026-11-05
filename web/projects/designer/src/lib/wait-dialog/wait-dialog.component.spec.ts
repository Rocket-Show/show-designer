import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { WaitDialogComponent } from './wait-dialog.component';

// The wait dialog covers the designer while a project is being loaded.
describe('WaitDialogComponent', () => {
  it('asks to wait, with a running progress bar', () => {
    TestBed.configureTestingModule({
      declarations: [WaitDialogComponent],
      imports: [TranslateModule.forRoot()],
    });

    const fixture = TestBed.createComponent(WaitDialogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.card-text').textContent).toBe('designer.misc.please-wait');
    expect(fixture.nativeElement.querySelector('.progress-bar').classList).toContain('progress-bar-animated');
  });
});
