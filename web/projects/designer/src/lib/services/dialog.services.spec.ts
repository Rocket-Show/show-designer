import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { of, Subject } from 'rxjs';

import { ErrorDialogService } from './error-dialog.service';
import { FixturePoolService } from './fixture-pool.service';
import { ConfigService } from './config.service';
import { UserEnsureLoginService } from './user-ensure-login.service';
import { UserService } from './user.service';
import { WarningDialogService } from './warning-dialog.service';

// The services opening the dialogs of the designer: what they show and what they make of the answer.
describe('the dialog services', () => {
  let show: jasmine.Spy;
  let content: any;

  beforeEach(() => {
    content = { onClose: new Subject<number>() };
    show = jasmine.createSpy('show').and.callFake(() => ({ content }));

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BsModalService, useValue: { show } }],
    });

    spyOn(TestBed.inject(TranslateService), 'get').and.callFake((key: string) => of('translated ' + key));
  });

  it('shows an error with its details, OK being the first button', () => {
    const answers: boolean[] = [];

    TestBed.inject(ErrorDialogService)
      .show('designer.error', 'stack')
      .subscribe((answer) => answers.push(answer));
    content.onClose.next(1);
    content.onClose.next(2);

    expect(show.calls.mostRecent().args[1]).toEqual({ keyboard: true, ignoreBackdropClick: false });
    expect(content.message).toBe('translated designer.error');
    expect(content.details).toBe('stack');
    expect(answers).toEqual([true, false]);
  });

  it('shows a warning, which only its buttons close', () => {
    const answers: boolean[] = [];

    TestBed.inject(WarningDialogService)
      .show('designer.warning')
      .subscribe((answer) => answers.push(answer));
    content.onClose.next(1);
    content.onClose.next(2);

    expect(show.calls.mostRecent().args[1]).toEqual({ keyboard: false, ignoreBackdropClick: true });
    expect(content.message).toBe('translated designer.warning');
    expect(answers).toEqual([true, false]);
  });

  it('opens the fixture pool once at a time', () => {
    const service = TestBed.inject(FixturePoolService);

    service.open();
    service.open();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.calls.mostRecent().args[1].class).toBe('modal-full');

    content.onClose.next(1);
    content = { onClose: new Subject<number>() };
    service.open();
    expect(show).toHaveBeenCalledTimes(2);
  });

  describe('making sure a user is logged in', () => {
    let loggedIn: boolean;
    let configService: ConfigService;

    beforeEach(() => {
      loggedIn = false;
      spyOn(TestBed.inject(UserService), 'isLoggedIn').and.callFake(() => loggedIn);
      configService = TestBed.inject(ConfigService);
      configService.loginAvailable = true;
    });

    function login(): boolean {
      let done = false;
      TestBed.inject(UserEnsureLoginService)
        .login()
        .subscribe(() => (done = true));
      return done;
    }

    it('goes on right away for a user who is logged in', () => {
      loggedIn = true;

      expect(login()).toBe(true);
      expect(show).not.toHaveBeenCalled();
    });

    it('goes on right away where nobody can log in (on a Rocket Show device)', () => {
      configService.loginAvailable = false;

      expect(login()).toBe(true);
      expect(show).not.toHaveBeenCalled();
    });

    it('goes on once the user logged in in the dialog', () => {
      expect(login()).toBe(false);

      const subject: Subject<void> = show.calls.mostRecent().args[1].initialState.subject;
      let done = false;
      subject.subscribe(() => (done = true));
      subject.next();

      expect(done).toBe(true);
    });
  });
});
