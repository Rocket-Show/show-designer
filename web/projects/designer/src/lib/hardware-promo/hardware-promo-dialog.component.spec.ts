import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';

import { HardwarePromoDialogComponent } from './hardware-promo-dialog.component';

// After exporting a show, the dialog points at the hardware it can be played on.
describe('HardwarePromoDialogComponent', () => {
  let fixture: ComponentFixture<HardwarePromoDialogComponent>;
  let hide: jasmine.Spy;

  beforeEach(() => {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [HardwarePromoDialogComponent],
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }],
    });

    fixture = TestBed.createComponent(HardwarePromoDialogComponent);
    fixture.detectChanges();
  });

  function link(): HTMLAnchorElement {
    return fixture.nativeElement.querySelector('a.btn-primary');
  }

  it('links to the hardware, tagged as coming from the export', () => {
    expect(link().href).toContain('utm_content=export');
    expect(link().target).toBe('_blank');
    expect(fixture.nativeElement.textContent).toContain('designer.hardware-promo.export-text');
  });

  it('closes once its link has been followed', () => {
    // the link opens a new tab, which isn't what the test is about
    link().addEventListener('click', (event) => event.preventDefault());

    link().click();

    expect(hide).toHaveBeenCalled();
  });

  it('can be dismissed', () => {
    fixture.nativeElement.querySelector('.card-footer a:not(.btn)').click();

    expect(hide).toHaveBeenCalled();
  });
});
