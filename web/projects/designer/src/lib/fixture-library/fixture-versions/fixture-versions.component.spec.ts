import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { Subject } from 'rxjs';

import { FixtureVersion } from '../../models/fixture-version';
import { FixtureLibraryService } from '../../services/fixture-library.service';
import { FixtureVersionBadgesComponent } from '../fixture-version-badges/fixture-version-badges.component';
import { FixtureVersionsComponent } from './fixture-versions.component';

// All versions of a fixture, the best one first: each with what is known about it and about each of its modes, the
// one in use marked, any other one to take instead, and a version for the AI to improve.
describe('FixtureVersionsComponent', () => {
  let fixture: ComponentFixture<FixtureVersionsComponent>;
  let component: FixtureVersionsComponent;
  let versions: Subject<FixtureVersion[]>;
  let getVersions: jasmine.Spy;

  const best: FixtureVersion = {
    uuid: 'acme/par~3',
    origin: 'ai',
    state: 'confirmed',
    confirmations: 2,
    best: true,
    created: '2026-11-13T10:00:00Z',
    modeStates: [
      { shortName: '8ch', name: '8-channel', hash: 'a', state: 'confirmed', good: 2, bad: 0 },
      { shortName: '4ch', name: '', hash: 'b', state: 'open', good: 0, bad: 0 },
    ],
  };
  const old: FixtureVersion = {
    uuid: 'acme/par~1',
    origin: 'ofl',
    state: 'problem',
    problems: 1,
    hidden: true,
    retired: true,
    created: '2025-01-02T10:00:00Z',
  };

  beforeEach(() => {
    versions = new Subject();
    getVersions = jasmine.createSpy('getVersions').and.returnValue(versions);

    TestBed.configureTestingModule({
      declarations: [FixtureVersionsComponent, FixtureVersionBadgesComponent],
      imports: [TranslateModule.forRoot(), PopoverModule.forRoot()],
      providers: [{ provide: FixtureLibraryService, useValue: { getVersions } }],
    });

    fixture = TestBed.createComponent(FixtureVersionsComponent);
    component = fixture.componentInstance;
    component.uuid = 'acme/par~1';
    component.currentUuid = 'acme/par~1';
  });

  const element = (): HTMLElement => fixture.nativeElement;
  const rows = (): HTMLElement[] => Array.from(element().querySelectorAll('.fixture-version'));

  it('lists the versions of the fixture, with the state of each mode, the one in use marked', () => {
    component.useLabel = 'designer.fixture-library.change';
    fixture.detectChanges();

    expect(getVersions).toHaveBeenCalledWith('acme/par~1');
    expect(element().querySelector('.fa-spinner')).not.toBeNull();

    versions.next([best, old]);
    fixture.detectChanges();

    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain('2026-11-13');
    expect(rows()[0].textContent).toContain('designer.fixture-library.best');
    expect(rows()[1].classList).toContain('fixture-version-current');
    expect(rows()[1].textContent).toContain('designer.fixture-library.in-use');
    expect(rows()[1].textContent).toContain('designer.fixture-library.hidden');
    expect(rows()[1].textContent).toContain('designer.fixture-library.retired');

    // each mode with its own state, by its name (or its short name)
    expect(component.rows[0].modes).toEqual([
      { name: '8-channel', badge: { state: 'confirmed', count: 2 }, key: 'designer.fixture-library.state-confirmed' },
      { name: '4ch', badge: { state: 'unconfirmed', count: 0 }, key: 'designer.fixture-library.state-unconfirmed' },
    ]);
    expect(component.rows[1].modes).toEqual([]);

    // the one in use is not taken again
    expect(rows()[0].querySelector('.fixture-version-use')).not.toBeNull();
    expect(rows()[1].querySelector('.fixture-version-use')).toBeNull();
    expect(element().querySelector('.fixture-version-improve')).toBeNull();
  });

  it('hands the version taken, or the one for the AI to improve, to the fixture pool', () => {
    const used: FixtureVersion[] = [];
    const improved: FixtureVersion[] = [];

    component.useLabel = 'designer.fixture-library.add';
    component.canImprove = true;
    component.currentUuid = undefined;

    component.use.subscribe((version) => used.push(version));
    component.improve.subscribe((version) => improved.push(version));
    fixture.detectChanges();
    versions.next([best, old]);
    fixture.detectChanges();

    (rows()[0].querySelector('.fixture-version-use') as HTMLElement).click();
    (rows()[1].querySelector('.fixture-version-improve') as HTMLElement).click();

    expect(used).toEqual([best]);
    expect(improved).toEqual([old]);

    // a version taken out of the library is not taken anew
    expect(rows()[1].querySelector('.fixture-version-use')).toBeNull();
  });

  it('lists the versions without a button to take one where it has nothing to do', () => {
    fixture.detectChanges();
    versions.next([best]);
    fixture.detectChanges();

    expect(element().querySelector('.fixture-version-use')).toBeNull();
  });

  it('says so when the library has no versions of the fixture', () => {
    fixture.detectChanges();
    versions.next([]);
    fixture.detectChanges();

    expect(element().querySelector('.fixture-versions-none').textContent).toContain('designer.fixture-library.versions-none');
  });

  it('says so when the versions could not be loaded', () => {
    fixture.detectChanges();
    versions.error(new Error('offline'));
    fixture.detectChanges();

    expect(component.failed).toBe(true);
    expect(component.loading).toBe(false);
    expect(element().textContent).toContain('designer.fixture-library.versions-failed');
  });
});
