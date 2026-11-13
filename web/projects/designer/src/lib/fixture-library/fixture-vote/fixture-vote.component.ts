import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { getForwardingErrorKey } from '../../models/api-error';
import { FixtureProfile } from '../../models/fixture-profile';
import { isVersionUuid } from '../../models/fixture-version';
import { ConfigService } from '../../services/config.service';
import { FixtureLibraryService, FixtureModeVotes, FixtureVotes } from '../../services/fixture-library.service';
import { UserEnsureLoginService } from '../../services/user-ensure-login.service';

// The votes on the mode a fixture of the project is used in (see docs/fixture-library.md, section 11): whether it works
// with the real fixture, and what is wrong with it if not. A vote counts for every version having the mode unchanged.
// Only a logged in account votes (online, or on a device linked with one), and only on a version of the library: a
// copy with a plain uuid (of an older project, or of a profile from a file) is of no version.
@Component({
  selector: 'lib-fixture-vote',
  templateUrl: './fixture-vote.component.html',
  styleUrls: ['./fixture-vote.component.css'],
  standalone: false,
})
export class FixtureVoteComponent {
  // the votes on the mode, as the library counts them
  votes: FixtureModeVotes;
  loading = false;
  sending = false;

  // the user marks the mode bad and may tell what is wrong
  askingComment = false;
  comment = '';

  // what went wrong, as the key of the translation
  errorKey: string;

  private _profile: FixtureProfile;
  private _mode: string;

  constructor(
    public configService: ConfigService,
    private fixtureLibraryService: FixtureLibraryService,
    private userEnsureLoginService: UserEnsureLoginService
  ) {}

  // the copy of the profile in the project the fixture is of
  @Input()
  set profile(value: FixtureProfile) {
    if (value !== this._profile) {
      this._profile = value;
      this.load();
    }
  }

  get profile(): FixtureProfile {
    return this._profile;
  }

  // the short name of the mode the fixture is used in
  @Input()
  set mode(value: string) {
    if (value !== this._mode) {
      this._mode = value;
      this.load();
    }
  }

  get mode(): string {
    return this._mode;
  }

  // a copy with a plain uuid can't be voted on
  get votable(): boolean {
    return isVersionUuid(this._profile?.uuid);
  }

  private load() {
    this.votes = undefined;
    this.askingComment = false;
    this.comment = '';
    this.errorKey = undefined;

    if (!this.votable || this._mode === undefined) {
      return;
    }

    this.loading = true;

    const profile = this._profile;
    const mode = this._mode;

    this.fixtureLibraryService.getVotes(profile.uuid).subscribe({
      next: (votes) => {
        // the answer of a fixture which isn't the one shown anymore is no use
        if (profile === this._profile && mode === this._mode) {
          this.loading = false;
          this.show(votes);
        }
      },
      error: (error) => {
        if (profile === this._profile && mode === this._mode) {
          this.loading = false;
          this.errorKey = getForwardingErrorKey(error) || 'designer.fixture-library.vote-failed';
        }
      },
    });
  }

  // the votes on the mode shown, which the copy of the profile in the project keeps the state of as well
  private show(votes: FixtureVotes) {
    this.votes = (votes?.modes || []).find((mode) => mode.shortName === this._mode);

    const modeState = (this._profile.modeStates || []).find((mode) => mode.shortName === this._mode);

    if (this.votes && modeState) {
      modeState.state = this.votes.state;
      modeState.good = this.votes.good;
      modeState.bad = this.votes.bad;
    }
  }

  // the mode works with the real fixture
  voteGood() {
    this.send(true, undefined);
  }

  // the mode has a mistake: the user is asked what is wrong (they don't have to say)
  voteBad() {
    this.askingComment = true;
    this.comment = this.votes?.myVote?.good === false ? this.votes.myVote.comment || '' : '';
  }

  sendBad() {
    this.send(false, this.comment.trim());
  }

  cancelBad() {
    this.askingComment = false;
  }

  // take the vote of the user on the mode back
  revoke() {
    this.request(() => this.fixtureLibraryService.revokeVote(this._profile.uuid, this._mode));
  }

  private send(good: boolean, comment: string) {
    this.request(() => this.fixtureLibraryService.vote(this._profile.uuid, this._mode, good, comment));
  }

  // A vote, sent once the user is logged in (the host of the designer logs itself in): the votes come back with it
  // counted at once.
  private request(send: () => Observable<FixtureVotes>) {
    this.userEnsureLoginService.login().subscribe(() => {
      this.sending = true;
      this.errorKey = undefined;

      send().subscribe({
        next: (votes) => {
          this.sending = false;
          this.askingComment = false;
          this.show(votes);
        },
        error: (error) => {
          this.sending = false;
          this.errorKey = this.userEnsureLoginService.isRefused(error)
            ? this.userEnsureLoginService.refused('designer.fixture-library.vote-log-in')
            : getForwardingErrorKey(error) || 'designer.fixture-library.vote-failed';
        },
      });
    });
  }
}
