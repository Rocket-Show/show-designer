import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { PopoverModule } from 'ngx-bootstrap/popover';

import { FixtureVersion } from '../../models/fixture-version';
import { FixtureVersionBadgesComponent } from './fixture-version-badges.component';

// The badges of a version of a profile: where it comes from, what is known about it (or about a mode of it) and how
// many use it; a generated version explains itself in a popover.
describe('FixtureVersionBadgesComponent', () => {
  let fixture: ComponentFixture<FixtureVersionBadgesComponent>;
  let component: FixtureVersionBadgesComponent;

  const generated: FixtureVersion = {
    uuid: 'acme/par~2',
    origin: 'ai',
    state: 'open',
    usage: 4,
    manual: { url: 'https://example.com/par.pdf' },
    modeStates: [{ shortName: '8ch', name: '8-channel', hash: 'a', state: 'confirmed', good: 1, bad: 0 }],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FixtureVersionBadgesComponent],
      imports: [TranslateModule.forRoot(), PopoverModule.forRoot()],
      providers: [provideNoopAnimations()],
    });

    fixture = TestBed.createComponent(FixtureVersionBadgesComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.querySelectorAll('popover-container').forEach((popover) => popover.remove());
  });

  function show(version: FixtureVersion, mode?: string) {
    component.version = version;
    if (mode !== undefined) {
      component.mode = mode;
    }
    fixture.detectChanges();
  }

  const texts = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.badge, .fixture-usage')).map((badge: HTMLElement) => badge.textContent.trim());

  it('marks a version of the Open Fixture Library by where it comes from and its usage only, while it is open', () => {
    show({ uuid: 'acme/par~1', origin: 'ofl', state: 'open', usage: 12 });

    expect(texts()).toEqual(['designer.fixture-library.origin-ofl', '12']);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.fixture-usage').title).toBe('designer.fixture-library.usage');
  });

  it('marks a generated version as not confirmed yet, or by the users who confirmed it', () => {
    show(generated);

    expect(texts()).toEqual(['designer.fixture-library.origin-ai', 'designer.fixture-library.state-unconfirmed', '4']);
    expect(component.generated).toBe(true);

    show({ ...generated, state: 'confirmed', confirmations: 1 });
    expect(component.stateKey).toBe('designer.fixture-library.state-confirmed-one');
    expect(component.stateBadge).toEqual({ state: 'confirmed', count: 1 });
  });

  it('marks the state of the mode passed instead of the one of the version', () => {
    show(generated, '8ch');

    expect(component.mode).toBe('8ch');
    expect(component.stateBadge).toEqual({ state: 'confirmed', count: 1 });
  });

  it('shows nothing for a profile the library tells nothing about', () => {
    show({ uuid: 'acme/par' } as FixtureVersion);

    expect(texts()).toEqual([]);
    expect(component.usage).toBeUndefined();
  });

  it('explains a generated version in a popover, with the manual it was made from', () => {
    show(generated);

    (fixture.nativeElement.querySelector('button.fixture-origin') as HTMLElement).click();
    fixture.detectChanges();

    const popover = document.querySelector('popover-container');
    expect(popover.textContent).toContain('designer.fixture-library.generated-ai');
    expect(popover.textContent).toContain('designer.fixture-library.generated-test');
    expect((popover.querySelector('a') as HTMLAnchorElement).href).toBe('https://example.com/par.pdf');
  });

  it('names the file of the manual where it has no public address, and nothing without a manual', () => {
    show({ ...generated, origin: 'user', manual: { name: 'par.pdf' } });
    (fixture.nativeElement.querySelector('button.fixture-origin') as HTMLElement).click();
    fixture.detectChanges();

    let popover = document.querySelector('popover-container');
    expect(popover.textContent).toContain('designer.fixture-library.generated-user');
    expect(popover.textContent).toContain('designer.fixture-library.manual-file');
    (fixture.nativeElement.querySelector('button.fixture-origin') as HTMLElement).click();
    fixture.detectChanges();

    show({ ...generated, manual: null });
    (fixture.nativeElement.querySelector('button.fixture-origin') as HTMLElement).click();
    fixture.detectChanges();

    popover = document.querySelector('popover-container');
    expect(popover.querySelector('a')).toBeNull();
    expect(popover.textContent).not.toContain('designer.fixture-library.manual-file');
  });
});
