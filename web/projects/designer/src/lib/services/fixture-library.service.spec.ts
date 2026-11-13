import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Fixture } from '../models/fixture';
import { FixtureProfile } from '../models/fixture-profile';
import { FixtureVersion } from '../models/fixture-version';
import { FixtureLibraryService } from './fixture-library.service';
import { UserService } from './user.service';

// The fixture library beyond the search: the versions of a fixture, the hint of a better version for the fixtures of
// a project, the votes and the profiles offered, as the API of the online designer (or a device) answers them.
describe('FixtureLibraryService', () => {
  let service: FixtureLibraryService;
  let http: HttpTestingController;
  let headers: HttpHeaders;

  // the best version does the 14 channels differently than the first one
  const versions: FixtureVersion[] = [
    {
      uuid: 'stairville/mh-100~3',
      best: true,
      modeStates: [{ shortName: '14ch', name: '14-channel', hash: 'b', state: 'confirmed', good: 2, bad: 0 }],
    },
    {
      uuid: 'stairville/mh-100~1',
      modeStates: [{ shortName: '14ch', name: '14-channel', hash: 'a', state: 'open', good: 0, bad: 0 }],
    },
  ];

  beforeEach(() => {
    headers = new HttpHeaders({ Authorization: 'session' });

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: UserService, useValue: { getHeaders: () => headers } }],
    });

    service = TestBed.inject(FixtureLibraryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists all versions of the fixture of a version, and tells when it got them', () => {
    let listed: FixtureVersion[];
    let changes = 0;

    service.versionsChanged.subscribe(() => changes++);
    service.getVersions('stairville/mh-100~1').subscribe((result) => (listed = result));
    http.expectOne('fixtures?fixture=stairville%2Fmh-100~1').flush(versions);

    expect(listed).toEqual(versions);
    expect(changes).toBe(1);
  });

  it('looks the versions of the copies of a project up, and finds a better one for a fixture', () => {
    const head = new Fixture({ profileUuid: 'stairville/mh-100~1', modeShortName: '14ch' });

    expect(service.getBetterVersion(head)).toBeUndefined();

    service.checkVersions([
      new FixtureProfile({ uuid: 'stairville/mh-100~1' }),
      new FixtureProfile({ uuid: 'cameo/flat-par' }),
      new FixtureProfile({ uuid: 'acme/gone~2' }),
    ]);

    // a plain uuid has no version to compare
    http.expectOne('fixtures?fixture=stairville%2Fmh-100~1').flush(versions);
    http.expectOne('fixtures?fixture=acme%2Fgone~2').flush({ error: 'offline' }, { status: 500, statusText: 'Error' });

    expect(service.getBetterVersion(head)).toEqual({ reason: 'changed', version: versions[0] });
    expect(service.getBetterVersion(new Fixture({ profileUuid: 'acme/gone~2', modeShortName: '4ch' }))).toBeUndefined();
  });

  it('reads the votes on the modes of a version, as the user', () => {
    let votes: any;

    service.getVotes('stairville/mh-100~1').subscribe((result) => (votes = result));
    const request = http.expectOne('fixture-vote?uuid=stairville%2Fmh-100~1');
    request.flush({ modes: [] });

    expect(request.request.headers.get('Authorization')).toBe('session');
    expect(votes).toEqual({ modes: [] });
  });

  it('votes on a mode, with what is wrong with it or without', () => {
    service.vote('stairville/mh-100~1', '14ch', false, 'Channel 6 is the strobe').subscribe();
    service.vote('stairville/mh-100~1', '14ch', true, '').subscribe();

    const [bad, good] = http.match('fixture-vote');

    expect(bad.request.method).toBe('POST');
    expect(JSON.parse(bad.request.body)).toEqual({
      uuid: 'stairville/mh-100~1',
      mode: '14ch',
      good: false,
      comment: 'Channel 6 is the strobe',
    });
    expect(bad.request.headers.get('Authorization')).toBe('session');
    expect(bad.request.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(good.request.body)).toEqual({ uuid: 'stairville/mh-100~1', mode: '14ch', good: true });

    bad.flush({ modes: [] });
    good.flush({ modes: [] });
  });

  it('takes a vote back', () => {
    service.revokeVote('stairville/mh-100~1', '14 ch').subscribe();

    const request = http.expectOne('fixture-vote?uuid=stairville%2Fmh-100~1&mode=14%20ch');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('Authorization')).toBe('session');
    request.flush({ modes: [] });
  });

  it('offers a profile file to the library, also without the login of the designer (the host holds it)', () => {
    headers = null;
    let offered: any;

    service.offer({ name: 'Par' }, undefined, 'Acme').subscribe((result) => (offered = result));

    const request = http.expectOne('fixture-offer');
    expect(request.request.method).toBe('POST');
    expect(JSON.parse(request.request.body)).toEqual({ profile: { name: 'Par' }, manufacturerName: 'Acme' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    request.flush({ version: { uuid: 'acme/par~1' } });

    expect(offered).toEqual({ version: { uuid: 'acme/par~1' } });
  });

  it('lists the manufacturers of the library', () => {
    let manufacturers: any;

    service.getManufacturers().subscribe((result) => (manufacturers = result));
    http.expectOne('manufacturer').flush([{ shortName: 'acme', name: 'Acme' }]);

    expect(manufacturers).toEqual([{ shortName: 'acme', name: 'Acme' }]);
  });
});
