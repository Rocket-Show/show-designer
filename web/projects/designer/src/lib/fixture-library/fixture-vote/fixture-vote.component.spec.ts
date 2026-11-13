import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { of, Subject, throwError } from 'rxjs';

import { FixtureProfile } from '../../models/fixture-profile';
import { ConfigService } from '../../services/config.service';
import { FixtureLibraryService, FixtureModeVotes, FixtureVotes } from '../../services/fixture-library.service';
import { UserEnsureLoginService } from '../../services/user-ensure-login.service';
import { UserService } from '../../services/user.service';
import { FixtureVoteComponent } from './fixture-vote.component';

// The votes on the mode a fixture is used in: whether it works with the real fixture, and what is wrong with it if not,
// from a logged in account only, and on a version of the library only.
describe('FixtureVoteComponent', () => {
  let fixture: ComponentFixture<FixtureVoteComponent>;
  let component: FixtureVoteComponent;
  let config: ConfigService;
  let library: { getVotes: jasmine.Spy; vote: jasmine.Spy; revokeVote: jasmine.Spy };
  let logout: jasmine.Spy;
  let loggedIn: Subject<void>;
  let profile: FixtureProfile;

  function votes(mode: Partial<FixtureModeVotes> = {}): FixtureVotes {
    return {
      modes: [
        { shortName: '4ch', hash: 'b', state: 'open', good: 0, bad: 0, comments: [], myVote: null },
        { shortName: '8ch', hash: 'a', state: 'open', good: 1, bad: 1, comments: ['Channel 6 is the strobe'], myVote: null, ...mode },
      ],
    };
  }

  beforeEach(() => {
    logout = jasmine.createSpy('logout');
    loggedIn = undefined;
    library = {
      getVotes: jasmine.createSpy('getVotes').and.returnValue(of(votes())),
      vote: jasmine
        .createSpy('vote')
        .and.callFake((uuid, mode, good, comment) =>
          of(votes({ good: good ? 2 : 1, bad: good ? 1 : 2, state: good ? 'confirmed' : 'problem', myVote: { good, comment } }))
        ),
      revokeVote: jasmine.createSpy('revokeVote').and.returnValue(of(votes())),
    };

    TestBed.configureTestingModule({
      declarations: [FixtureVoteComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
      providers: [
        { provide: FixtureLibraryService, useValue: library },
        { provide: UserService, useValue: { logout, isLoggedIn: () => !loggedIn } },
        { provide: BsModalService, useValue: { show: (component: any, options: any) => (loggedIn = options.initialState.subject) } },
      ],
    });

    config = TestBed.inject(ConfigService);
    config.loginAvailable = true;

    profile = new FixtureProfile({
      uuid: 'acme/par~2',
      modeStates: [{ shortName: '8ch', name: '8-channel', hash: 'a', state: 'open', good: 0, bad: 0 }],
    });

    fixture = TestBed.createComponent(FixtureVoteComponent);
    component = fixture.componentInstance;
  });

  function show(shown: FixtureProfile, mode: string) {
    component.profile = shown;
    component.mode = mode;
    fixture.detectChanges();
  }

  const element = (): HTMLElement => fixture.nativeElement;
  const button = (name: string): HTMLButtonElement => element().querySelector('.fixture-vote-' + name);

  it('shows the votes on the mode, which the copy of the profile in the project keeps the state of', () => {
    show(profile, '8ch');

    expect(library.getVotes.calls.allArgs()).toEqual([['acme/par~2']]);
    expect(component.profile).toBe(profile);
    expect(component.mode).toBe('8ch');
    expect(button('good').textContent.trim()).toBe('1');
    expect(button('bad').textContent.trim()).toBe('1');
    expect(element().querySelector('.fixture-vote-comments').textContent).toContain('Channel 6 is the strobe');
    expect(profile.modeStates[0]).toEqual(jasmine.objectContaining({ good: 1, bad: 1, state: 'open' }));
  });

  it('marks the mode good, counted at once', () => {
    show(profile, '8ch');

    button('good').click();
    fixture.detectChanges();

    expect(library.vote).toHaveBeenCalledWith('acme/par~2', '8ch', true, undefined);
    expect(button('good').classList).toContain('btn-success');
    expect(button('good').textContent.trim()).toBe('2');
    expect(profile.modeStates[0].state).toBe('confirmed');
  });

  it('marks the mode bad, with what is wrong if the user says, and takes the vote back', () => {
    show(profile, '8ch');

    button('bad').click();
    fixture.detectChanges();

    expect(component.askingComment).toBe(true);
    const comment: HTMLInputElement = element().querySelector('.fixture-vote-comment');
    comment.value = '  Channel 6 is the strobe ';
    comment.dispatchEvent(new Event('input'));
    comment.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(library.vote).toHaveBeenCalledWith('acme/par~2', '8ch', false, 'Channel 6 is the strobe');
    expect(component.askingComment).toBe(false);
    expect(button('bad').classList).toContain('btn-danger');
    expect(profile.modeStates[0]).toEqual(jasmine.objectContaining({ state: 'problem', bad: 2 }));

    // asked again, it starts from what the user said
    component.voteBad();
    expect(component.comment).toBe('Channel 6 is the strobe');
    component.cancelBad();
    expect(component.askingComment).toBe(false);

    (element().querySelector('.fixture-vote-revoke') as HTMLElement).click();
    fixture.detectChanges();

    expect(library.revokeVote).toHaveBeenCalledWith('acme/par~2', '8ch');
    expect(component.votes.myVote).toBeNull();
  });

  it('asks a user who is not logged in to log in first', () => {
    loggedIn = new Subject();
    show(profile, '8ch');

    component.voteGood();
    expect(library.vote).not.toHaveBeenCalled();

    loggedIn.next();
    expect(library.vote).toHaveBeenCalled();
  });

  it('starts a bad vote without a comment where the user marked the mode good', () => {
    library.getVotes.and.returnValue(of(votes({ myVote: { good: true } })));
    show(profile, '8ch');

    component.comment = 'left over';
    component.voteBad();

    expect(component.comment).toBe('');

    // (and from nothing where they marked it bad without saying why)
    library.getVotes.and.returnValue(of(votes({ myVote: { good: false } })));
    show(new FixtureProfile({ uuid: 'acme/par~3' }), '8ch');
    component.comment = 'left over';
    component.voteBad();

    expect(component.comment).toBe('');
  });

  it('tells the user to log in again, or to link the device, when the vote is refused', () => {
    show(profile, '8ch');
    library.vote.and.returnValue(throwError(new HttpErrorResponse({ status: 401, error: { error: 'unauthorized' } })));

    component.voteGood();
    expect(component.errorKey).toBe('designer.fixture-library.vote-log-in');
    expect(logout).toHaveBeenCalled();

    config.aiAccount = 'host';
    component.voteGood();
    expect(component.errorKey).toBe('designer.account.link-device');
    expect(component.sending).toBe(false);

    library.vote.and.returnValue(throwError(new HttpErrorResponse({ status: 404, error: { error: 'unknown-version' } })));
    component.voteGood();
    fixture.detectChanges();
    expect(component.errorKey).toBe('designer.fixture-library.vote-failed');
    expect(element().querySelector('.fixture-vote-error')).not.toBeNull();
  });

  it('says so when the votes could not be loaded', () => {
    library.getVotes.and.returnValue(throwError(new Error('offline')));
    show(profile, '8ch');

    expect(component.loading).toBe(false);
    expect(component.errorKey).toBe('designer.fixture-library.vote-failed');
  });

  it('leaves the answer of a fixture which is not shown anymore aside', () => {
    const answer = new Subject<FixtureVotes>();
    library.getVotes.and.returnValue(answer);
    show(profile, '8ch');

    library.getVotes.and.returnValue(of(votes()));
    component.mode = '4ch';
    answer.next(votes({ good: 9 }));
    answer.error(new Error('late'));

    expect(component.votes.shortName).toBe('4ch');
    expect(component.errorKey).toBeUndefined();
  });

  it('shows the votes without the buttons where the user can have no account', () => {
    config.loginAvailable = false;
    show(profile, '8ch');

    expect(button('good')).toBeNull();
    expect(element().textContent).toContain('1');
  });

  it('asks nothing for a copy which is of no version, and says why where the user could vote', () => {
    show(new FixtureProfile({ uuid: 'acme/par' }), '8ch');

    expect(library.getVotes).not.toHaveBeenCalled();
    expect(element().querySelector('.fixture-vote-plain')).not.toBeNull();

    config.loginAvailable = false;
    fixture.detectChanges();
    expect(element().querySelector('.fixture-vote-plain')).toBeNull();
  });

  it('waits for the mode, and asks again for another profile only', () => {
    component.profile = profile;
    expect(library.getVotes).not.toHaveBeenCalled();

    component.mode = '8ch';
    component.mode = '8ch';
    component.profile = profile;
    expect(library.getVotes).toHaveBeenCalledTimes(1);

    library.getVotes.and.returnValue(of({ modes: undefined }));
    component.profile = new FixtureProfile({ uuid: 'acme/par~3' });
    expect(library.getVotes).toHaveBeenCalledTimes(2);
    expect(component.votes).toBeUndefined();
  });
});
