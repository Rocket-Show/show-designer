import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';

import { ConfigService } from './config.service';
import { UserEnsureLoginService } from './user-ensure-login.service';
import { UserService } from './user.service';

// What needs an account: the login of the designer where it has one, and what the user is told when the API refused a
// request for want of an account, online or on a device which holds the account itself (see ConfigService.aiAccount).
describe('UserEnsureLoginService', () => {
  let service: UserEnsureLoginService;
  let config: ConfigService;
  let user: { isLoggedIn: jasmine.Spy; logout: jasmine.Spy };
  let show: jasmine.Spy;

  beforeEach(() => {
    user = { isLoggedIn: jasmine.createSpy('isLoggedIn').and.returnValue(false), logout: jasmine.createSpy('logout') };
    show = jasmine.createSpy('show');

    TestBed.configureTestingModule({
      providers: [
        { provide: UserService, useValue: user },
        { provide: BsModalService, useValue: { show } },
      ],
    });

    service = TestBed.inject(UserEnsureLoginService);
    config = TestBed.inject(ConfigService);
  });

  it('logs the user in with the login of the designer, where it has one and the user is not logged in yet', () => {
    const done: string[] = [];

    service.login().subscribe(() => done.push('without a login'));

    config.loginAvailable = true;
    user.isLoggedIn.and.returnValue(true);
    service.login().subscribe(() => done.push('logged in'));

    expect(done).toEqual(['without a login', 'logged in']);
    expect(show).not.toHaveBeenCalled();

    user.isLoggedIn.and.returnValue(false);
    service.login().subscribe(() => done.push('logged in now'));

    const subject: Subject<void> = show.calls.argsFor(0)[1].initialState.subject;
    subject.next();

    expect(done).toEqual(['without a login', 'logged in', 'logged in now']);
  });

  it('tells a request refused for want of an account from other failures', () => {
    expect(service.isRefused(new HttpErrorResponse({ status: 401, error: { error: 'unauthorized' } }))).toBe(true);
    expect(service.isRefused(new HttpErrorResponse({ status: 403, error: { error: 'device-not-linked' } }))).toBe(true);
    expect(service.isRefused(new HttpErrorResponse({ status: 401, error: 'Unauthorized' }))).toBe(true);
    expect(service.isRefused(new HttpErrorResponse({ status: 400, error: { error: 'unauthorized' } }))).toBe(true);
    expect(service.isRefused(new HttpErrorResponse({ status: 503, error: { error: 'ai-busy' } }))).toBe(false);
    expect(service.isRefused(new Error('offline'))).toBe(false);
    expect(service.isRefused(undefined)).toBe(false);
  });

  it('asks the user to log in again, after letting the session which ran out go', () => {
    expect(service.refused('designer.ai.error.unauthorized')).toBe('designer.ai.error.unauthorized');
    expect(user.logout).toHaveBeenCalled();
  });

  it('asks to link the device where the host holds the account, which the designer has no login for', () => {
    config.aiAccount = 'host';

    expect(service.refused('designer.ai.error.unauthorized')).toBe('designer.account.link-device');
    expect(user.logout).not.toHaveBeenCalled();
  });

  it('knows whether the user can have an account to vote and offer profiles with', () => {
    expect(config.hasAccount()).toBe(false);

    config.aiAccount = 'host';
    expect(config.hasAccount()).toBe(true);

    config.aiAccount = 'designer';
    config.loginAvailable = true;
    expect(config.hasAccount()).toBe(true);
  });
});
