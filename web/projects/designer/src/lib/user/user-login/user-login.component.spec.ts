import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';

import { UserService } from '../../services/user.service';
import { UserLoginComponent } from './user-login.component';

// The login of a user who registered before, which goes on with what it was required for
// (e.g. saving the project).
describe('UserLoginComponent', () => {
  const keys = ['token', 'tokenExpiration', 'username'];
  let fixture: ComponentFixture<UserLoginComponent>;
  let http: HttpTestingController;
  let hide: jasmine.Spy;

  function clearStorage() {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  beforeEach(async () => {
    clearStorage();
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [UserLoginComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }, provideHttpClient(), provideHttpClientTesting()],
    });

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UserLoginComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    clearStorage();
  });

  function field(id: string): HTMLInputElement {
    return fixture.nativeElement.querySelector('#' + id);
  }

  function type(id: string, value: string) {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
  }

  function submit() {
    fixture.nativeElement.querySelector('button[type=submit]').click();
    fixture.detectChanges();
  }

  function shownError(): string {
    const alert: HTMLElement = fixture.nativeElement.querySelector('.alert');
    return alert ? alert.textContent.trim() : undefined;
  }

  it('asks for the address and the password', () => {
    type('email', 'user@example.com');
    submit();

    expect(shownError()).toBe('designer.user.error.fill-all-fields');
  });

  it('logs the user in and goes on with what the login was required for', async () => {
    const subject = new Subject<void>();
    let wentOn = false;
    subject.subscribe(() => (wentOn = true));
    fixture.componentInstance.subject = subject;

    type('email', 'user@example.com');
    type('password', 'secret');
    submit();
    await fixture.whenStable();

    expect(field('email').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type=submit] .fa-spinner')).not.toBeNull();

    http.expectOne('login?email=user%40example.com&password=secret').flush({ token: 'token', username: 'Moritz' });

    expect(TestBed.inject(UserService).isLoggedIn()).toBe(true);
    expect(hide).toHaveBeenCalled();
    expect(wentOn).toBe(true);
  });

  it('logs in with the enter key', () => {
    type('email', 'user@example.com');
    type('password', 'secret');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    http.expectOne('login?email=user%40example.com&password=secret').flush({ token: 'token', username: 'Moritz' });
    expect(hide).toHaveBeenCalled();
  });

  it('says why the user could not be logged in, to try again', async () => {
    type('email', 'user@example.com');
    type('password', 'wrong');
    submit();

    http.expectOne(() => true).flush({ error: 'wrong-credentials' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(shownError()).toBe('designer.user.error.wrong-credentials');
    expect(field('password').disabled).toBe(false);
    expect(hide).not.toHaveBeenCalled();
  });

  it("says something went wrong, where the server didn't say what", () => {
    type('email', 'user@example.com');
    type('password', 'secret');
    submit();

    http.expectOne(() => true).flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    expect(shownError()).toBe('designer.user.error.internal');
  });

  it('is closed without logging in', () => {
    fixture.nativeElement.querySelector('button.close').click();
    fixture.nativeElement.querySelector('.modal-footer a').click();

    expect(hide).toHaveBeenCalledTimes(2);
  });
});
