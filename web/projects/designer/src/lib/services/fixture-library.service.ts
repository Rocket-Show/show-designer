import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Fixture } from '../models/fixture';
import { FixtureProfile } from '../models/fixture-profile';
import { FixtureBetterVersion, FixtureVersion, FixtureVersionState, getBetterVersion, isVersionUuid } from '../models/fixture-version';
import { UserService } from './user.service';

// the votes on one mode of a version, as the API counts them for the fixture and the hash of the mode
export interface FixtureModeVotes {
  shortName: string;
  hash: string;
  state: FixtureVersionState;
  good: number;
  bad: number;
  // what the users who marked the mode bad found wrong
  comments: string[];
  // the vote of the user, if they voted on the mode
  myVote: { good: boolean; comment?: string };
}

export interface FixtureVotes {
  modes: FixtureModeVotes[];
}

// a manufacturer of the library, which a new profile is made for
export interface FixtureManufacturer {
  shortName: string;
  name: string;
  website?: string;
}

// The fixture library beyond the search (see docs/fixture-library.md): the versions of a fixture, the hint of a better
// version for the fixtures of a project, the votes on the modes of a version and the profiles offered to the library.
// It talks to the API the designer is given: the one of the online designer, or a Rocket Show device, which answers
// from its own copy of the library and forwards what needs an account.
@Injectable({
  providedIn: 'root',
})
export class FixtureLibraryService {
  // The profile files read in this session, by the uuid of their copy in the project: what a profile is offered to the
  // library as (see FixtureOfferComponent). The copy itself isn't the file anymore, the designer reads a profile into
  // a model of its own.
  readonly files = new Map<string, any>();

  // the versions of the fixtures have been looked up again: the marks of a better version are worked out anew
  readonly versionsChanged = new Subject<void>();

  // the versions of the fixture of each copy of a profile looked up so far, by the uuid of the copy
  private versionsOfCopies = new Map<string, FixtureVersion[]>();

  constructor(private http: HttpClient, private userService: UserService) {}

  // All versions of the fixture a version is of (or the fixture of a plain uuid), the best one first, the hidden ones
  // included. They are kept for the hint of a better version, which they are the newest news of.
  getVersions(uuid: string): Observable<FixtureVersion[]> {
    return this.http.get<FixtureVersion[]>('fixtures?fixture=' + encodeURIComponent(uuid)).pipe(
      tap((versions) => {
        this.versionsOfCopies.set(uuid, versions);
        this.versionsChanged.next();
      })
    );
  }

  // Look the versions of the copies of the profiles of a project up, for the hint of a better version, when a project
  // is opened. A copy with a plain uuid is of no version, there is nothing to compare it with. Without the library
  // (offline), the fixtures go without the hint.
  checkVersions(profiles: FixtureProfile[]) {
    for (const profile of profiles) {
      if (isVersionUuid(profile.uuid)) {
        this.getVersions(profile.uuid).subscribe({ error: () => this.versionsOfCopies.delete(profile.uuid) });
      }
    }
  }

  // the better version the library has for a fixture of the project, if any (see getBetterVersion)
  getBetterVersion(fixture: Fixture): FixtureBetterVersion {
    const versions = this.versionsOfCopies.get(fixture.profileUuid);

    return versions ? getBetterVersion(fixture.profileUuid, fixture.modeShortName, versions) : undefined;
  }

  // the votes on the modes of a version, with the one of the user on each
  getVotes(uuid: string): Observable<FixtureVotes> {
    return this.http.get<FixtureVotes>('fixture-vote?uuid=' + encodeURIComponent(uuid), { headers: this.userService.getHeaders() });
  }

  // mark a mode of a version good or bad, with what is wrong with it, or change the vote given before
  vote(uuid: string, mode: string, good: boolean, comment: string): Observable<FixtureVotes> {
    const body: any = { uuid, mode, good };

    if (comment) {
      body.comment = comment;
    }

    return this.http.post<FixtureVotes>('fixture-vote', JSON.stringify(body), { headers: this.jsonHeaders() });
  }

  // take the vote on a mode of a version back
  revokeVote(uuid: string, mode: string): Observable<FixtureVotes> {
    return this.http.delete<FixtureVotes>('fixture-vote?uuid=' + encodeURIComponent(uuid) + '&mode=' + encodeURIComponent(mode), {
      headers: this.userService.getHeaders(),
    });
  }

  // offer a profile file to the library, as a version from a user of the manufacturer of the library passed (or of a new
  // one, by its name)
  offer(profile: any, manufacturerShortName: string, manufacturerName: string): Observable<{ version: FixtureVersion }> {
    return this.http.post<{ version: FixtureVersion }>(
      'fixture-offer',
      JSON.stringify({ profile, manufacturerShortName, manufacturerName }),
      {
        headers: this.jsonHeaders(),
      }
    );
  }

  getManufacturers(): Observable<FixtureManufacturer[]> {
    return this.http.get<FixtureManufacturer[]>('manufacturer');
  }

  private jsonHeaders(): HttpHeaders {
    return (this.userService.getHeaders() || new HttpHeaders()).set('Content-Type', 'application/json');
  }
}
