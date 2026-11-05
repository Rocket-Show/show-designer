import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PopoverModule } from 'ngx-bootstrap/popover';

import { ConfigService } from '../services/config.service';
import { IntroService } from '../services/intro.service';
import { HardwarePromoBarComponent } from './hardware-promo-bar.component';

// The bar at the bottom of the free online designer points somebody who came back to
// keep working on a show towards the hardware to play it on, until it is dismissed.
describe('HardwarePromoBarComponent', () => {
  const keys = ['hardwarePromoSessions', 'hardwarePromoLastVisit', 'hardwarePromoBarDismissed'];
  let fixture: ComponentFixture<HardwarePromoBarComponent>;

  function clearStorage() {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  // the bar of a designer visited for the passed number of sessions so far
  function open(sessions: number, hardwarePromo = true) {
    localStorage.setItem('hardwarePromoSessions', sessions.toString());

    TestBed.configureTestingModule({
      declarations: [HardwarePromoBarComponent],
      imports: [TranslateModule.forRoot(), PopoverModule.forRoot()],
    });
    TestBed.inject(ConfigService).hardwarePromo = hardwarePromo;

    fixture = TestBed.createComponent(HardwarePromoBarComponent);
    fixture.detectChanges();
  }

  function bar(): HTMLElement {
    return fixture.nativeElement.querySelector('.hardware-promo-bar');
  }

  beforeEach(clearStorage);
  afterEach(clearStorage);

  it('shows up for a returning visitor, with a tagged link to the hardware', () => {
    open(2);

    expect(bar().textContent).toContain('designer.hardware-promo.bar-title');
    const link: HTMLAnchorElement = bar().querySelector('a.btn-primary');
    expect(link.href).toContain('utm_content=returning-visitor-bar');
    expect(link.target).toBe('_blank');
  });

  it('leaves the first visit alone', () => {
    open(1);

    expect(bar()).toBeNull();
  });

  it('never shows up on a Rocket Show device', () => {
    open(5, false);

    expect(bar()).toBeNull();
  });

  it("doesn't get in the way of the introduction", () => {
    open(2);

    TestBed.inject(IntroService).showIntro = true;
    fixture.detectChanges();

    expect(bar()).toBeNull();
  });

  it('goes away for good when it is closed', () => {
    open(2);

    bar().querySelector<HTMLElement>('.hardware-promo-bar-close').click();
    fixture.detectChanges();

    expect(bar()).toBeNull();
    expect(localStorage.getItem('hardwarePromoBarDismissed')).toBe('true');
  });

  it('goes away once its link has been followed', () => {
    open(2);
    const link: HTMLAnchorElement = bar().querySelector('a.btn-primary');
    // the link opens a new tab, which isn't what the test is about
    link.addEventListener('click', (event) => event.preventDefault());

    link.click();
    fixture.detectChanges();

    expect(bar()).toBeNull();
  });
});
