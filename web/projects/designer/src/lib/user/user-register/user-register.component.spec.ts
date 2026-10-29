import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';

import { UserService } from '../../services/user.service';
import { UserLoginComponent } from '../user-login/user-login.component';
import { UserRegisterComponent } from './user-register.component';

// The registration of a new user, who is logged in right away and goes on with what the login
// was required for (e.g. saving the project). A user who registered before logs in instead.
describe('UserRegisterComponent', () => {
  const keys = ['token', 'tokenExpiration', 'username'];
  let fixture: ComponentFixture<UserRegisterComponent>;
  let http: HttpTestingController;
  let hide: jasmine.Spy;
  let show: jasmine.Spy;

  function clearStorage() {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  // the fields of the form only take what is typed once the form has been set up
  async function open(subject?: Subject<void>) {
    fixture = TestBed.createComponent(UserRegisterComponent);
    fixture.componentInstance.subject = subject;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    clearStorage();
    hide = jasmine.createSpy('hide');
    show = jasmine.createSpy('show');

    TestBed.configureTestingModule({
      declarations: [UserRegisterComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: BsModalService, useValue: { show } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpTestingController);
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

  function fill(email = 'user@example.com', password = 'secret', passwordRepeat = password) {
    type('username', 'Moritz');
    type('email', email);
    type('password', password);
    type('passwordRepeat', passwordRepeat);
  }

  function submit() {
    fixture.nativeElement.querySelector('button[type=submit]').click();
    fixture.detectChanges();
  }

  function shownError(): string {
    const alert: HTMLElement = fixture.nativeElement.querySelector('.alert-primary');
    return alert ? alert.textContent.trim() : undefined;
  }

  it('registers the user and logs them in, to go on with what the login was required for', async () => {
    const subject = new Subject<void>();
    let wentOn = false;
    subject.subscribe(() => (wentOn = true));
    await open(subject);

    expect(fixture.nativeElement.querySelector('.alert-success').textContent).toContain('designer.user.login-required');

    fill();
    field('newsletter').click();
    submit();
    await fixture.whenStable();

    expect(field('email').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type=submit] .fa-spinner')).not.toBeNull();

    http.expectOne('register?email=user%40example.com&username=Moritz&password=secret&newsletter=true').flush(null);
    http.expectOne('login?email=user%40example.com&password=secret').flush({ token: 'token', username: 'Moritz' });

    expect(TestBed.inject(UserService).isLoggedIn()).toBe(true);
    expect(hide).toHaveBeenCalled();
    expect(wentOn).toBe(true);
  });

  it('registers without the newsletter, unless the user wants it', async () => {
    await open();
    fill();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    http.expectOne('register?email=user%40example.com&username=Moritz&password=secret&newsletter=false').flush(null);
    http.expectOne(() => true).flush({ token: 'token', username: 'Moritz' });
    expect(hide).toHaveBeenCalled();
  });

  it('asks for all the fields', async () => {
    await open();
    type('username', 'Moritz');
    type('email', 'user@example.com');
    submit();

    expect(shownError()).toBe('designer.user.error.fill-all-fields');
  });

  it('asks for a valid address', async () => {
    await open();
    fill('user@example');
    submit();

    expect(shownError()).toBe('designer.user.error.email-valid');
  });

  it('asks for the same password twice', async () => {
    await open();
    fill('user@example.com', 'secret', 'secrets');
    submit();

    expect(shownError()).toBe('designer.user.error.password-mismatch');
  });

  it('says why the user could not be registered, to try again', async () => {
    await open();
    fill();
    submit();

    http.expectOne(() => true).flush({ error: 'email-exists' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(shownError()).toBe('designer.user.error.email-exists');
    expect(fixture.componentInstance.registering).toBe(false);
    expect(hide).not.toHaveBeenCalled();
  });

  it("says something went wrong, where the server didn't say what", async () => {
    await open();
    fill();
    submit();

    http.expectOne(() => true).flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    expect(shownError()).toBe('designer.user.error.internal');
  });

  it('says so, when the user could be registered but not logged in', async () => {
    await open(new Subject<void>());
    fill();
    submit();

    http.expectOne(() => true).flush(null);
    http.expectOne(() => true).flush(null, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(shownError()).toBe('designer.user.error.internal');
    expect(fixture.componentInstance.registering).toBe(false);
    expect(hide).not.toHaveBeenCalled();
  });

  it('lets a user who registered before log in instead', async () => {
    const subject = new Subject<void>();
    await open(subject);

    fixture.nativeElement.querySelector('.modal-body > a').click();

    expect(hide).toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(UserLoginComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      initialState: { subject },
    });
  });

  it('is closed without registering', async () => {
    await open();

    fixture.nativeElement.querySelector('button.close').click();
    fixture.nativeElement.querySelector('.modal-footer a').click();

    expect(hide).toHaveBeenCalledTimes(2);
  });
});
