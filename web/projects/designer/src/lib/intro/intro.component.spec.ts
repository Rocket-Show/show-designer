import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ConfigService } from '../services/config.service';
import { IntroService } from '../services/intro.service';
import { LayoutService } from '../services/layout.service';
import { IntroComponent } from './intro.component';

// The introduction walks a new user through the designer step by step, next to the panel
// each step is about, until it is closed.
describe('IntroComponent', () => {
  let fixture: ComponentFixture<IntroComponent>;
  let introService: IntroService;
  let layoutService: LayoutService;
  let stored: string;

  beforeEach(() => {
    stored = localStorage.getItem('showIntro');
    localStorage.removeItem('showIntro');

    TestBed.configureTestingModule({
      declarations: [IntroComponent],
      imports: [TranslateModule.forRoot()],
    });

    layoutService = TestBed.inject(LayoutService);
    layoutService.compact = false;
    introService = TestBed.inject(IntroService);
    introService.showIntro = true;

    fixture = TestBed.createComponent(IntroComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    if (stored === null) {
      localStorage.removeItem('showIntro');
    } else {
      localStorage.setItem('showIntro', stored);
    }
  });

  function card(): HTMLElement {
    return fixture.nativeElement.querySelector('.card');
  }

  function buttons(): string[] {
    return Array.from(card().querySelectorAll('.card-footer button')).map((button: HTMLElement) => button.textContent.trim());
  }

  function click(label: string) {
    const button = Array.from(card().querySelectorAll<HTMLElement>('.card-footer button')).find(
      (candidate) => candidate.textContent.trim() === label
    );
    button.click();
    fixture.detectChanges();
  }

  it('starts in the middle, with a way forward only', () => {
    expect(card().querySelector('.card-header').textContent).toContain('designer.intro.title-start');
    expect(card().querySelector('.card-body').textContent).toContain('designer.intro.step-start');
    expect(card().style.top).toBe('calc(50% - 150px)');
    expect(card().style.left).toBe('calc(50% - 200px)');
    expect(buttons()).toEqual(['designer.intro.next']);
  });

  it('moves next to the panel of the next step, and back', () => {
    click('designer.intro.next');

    expect(card().querySelector('.card-body').textContent).toContain('designer.intro.step-preview');
    expect(card().style.top).toBe('calc(60% - 150px)');
    expect(card().style.left).toBe('calc(40% - 200px)');
    expect(buttons()).toEqual(['designer.intro.back', 'designer.intro.next']);

    click('designer.intro.back');

    expect(card().querySelector('.card-body').textContent).toContain('designer.intro.step-start');
  });

  it('stays at the bottom of a phone, and brings the panel of each step into view there', fakeAsync(() => {
    // the panels of the designer, the one of the step marked
    const designer = document.createElement('div');
    designer.id = 'designer';
    designer.innerHTML = '<div class="card"></div><div class="card card-intro-active"></div>';
    document.body.appendChild(designer);
    const scrolled = spyOn(designer.querySelector<HTMLElement>('.card-intro-active'), 'scrollIntoView');

    // next to the panel, it is in view already
    click('designer.intro.next');
    tick();
    expect(scrolled).not.toHaveBeenCalled();

    layoutService.compact = true;
    fixture.detectChanges();

    expect(card().style.top).toBe('');
    expect(card().style.left).toBe('');

    click('designer.intro.next');
    tick();

    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    designer.remove();
  }));

  it('is closed at its last step, for good', () => {
    for (let i = 0; i < 7; i++) {
      click('designer.intro.next');
    }

    expect(card().querySelector('.card-body').textContent).toContain('designer.intro.step-finish');
    expect(buttons()).toEqual(['designer.intro.back', 'designer.intro.close']);

    click('designer.intro.close');

    expect(card()).toBeNull();
    expect(localStorage.getItem('showIntro')).toBe('false');
  });

  it('can be closed at any step', () => {
    card().querySelector<HTMLElement>('.card-header button.close').click();
    fixture.detectChanges();

    expect(card()).toBeNull();
    expect(introService.showIntro).toBe(false);
  });

  it('points at the hardware at its end, in the free online designer only', () => {
    for (let i = 0; i < 7; i++) {
      click('designer.intro.next');
    }

    expect(card().textContent).not.toContain('designer.hardware-promo.intro-finish');

    TestBed.inject(ConfigService).hardwarePromo = true;
    fixture.detectChanges();

    expect(card().textContent).toContain('designer.hardware-promo.intro-finish');
    expect(card().querySelector<HTMLAnchorElement>('.card-body a').href).toContain('utm_content=intro-finish');
  });
});
