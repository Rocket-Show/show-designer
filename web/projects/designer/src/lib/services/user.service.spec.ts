import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Project } from '../models/project';
import { UserService } from './user.service';

// The user logged in to the designer API: the token is kept in the local storage for a month.
describe('UserService', () => {
  const keys = ['token', 'tokenExpiration', 'username', 'projectId', 'projectName'];
  let http: HttpTestingController;

  function clearStorage() {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  function createService(): UserService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(UserService);
  }

  beforeEach(clearStorage);

  afterEach(() => {
    http.verify();
    clearStorage();
  });

  it('registers a user, named and with a password for an address', () => {
    const service = createService();

    service.register('a+b@example.com', 'Rock & Roll', 'p&ss=w#rd+', true).subscribe();

    const request = http.expectOne(
      'register?email=a%2Bb%40example.com&username=Rock%20%26%20Roll&password=p%26ss%3Dw%23rd%2B&newsletter=true'
    );
    expect(request.request.method).toBe('POST');
    request.flush(null);
  });

  it('logs a user in for a month', () => {
    const service = createService();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.getHeaders()).toBeNull();

    service.login('a+b@example.com', 'p&ss').subscribe();
    http.expectOne('login?email=a%2Bb%40example.com&password=p%26ss').flush({ token: 'secret', username: 'Moritz' });

    expect(service.isLoggedIn()).toBe(true);
    expect(service.username).toBe('Moritz');
    expect(service.getHeaders().get('Authorization')).toBe('secret');
    const days = (service.tokenExpiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30.1);
  });

  it('stays logged in after a reload, until the month is over', () => {
    createService().login('a@example.com', 'secret').subscribe();
    http.expectOne(() => true).flush({ token: 'secret', username: 'Moritz' });

    TestBed.resetTestingModule();
    const reloaded = createService();
    expect(reloaded.isLoggedIn()).toBe(true);
    expect(reloaded.username).toBe('Moritz');

    reloaded.tokenExpiration = new Date(Date.now() - 1);
    expect(reloaded.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('reads the expiration stored by earlier versions', () => {
    const past = new Date(Date.now() - 1000);
    localStorage.setItem('token', 'secret');
    localStorage.setItem('tokenExpiration', JSON.stringify(past));

    const service = createService();

    expect(service.tokenExpiration.getTime()).toBe(past.getTime());
    expect(service.isLoggedIn()).toBe(false);
  });

  it('logs a user out', () => {
    localStorage.setItem('token', 'secret');
    localStorage.setItem('tokenExpiration', new Date(Date.now() + 60000).toISOString());
    localStorage.setItem('username', 'Moritz');
    const service = createService();
    expect(service.isLoggedIn()).toBe(true);

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(service.token).toBeNull();
    expect(service.username).toBeNull();
    expect(service.tokenExpiration).toBeUndefined();
  });

  it('remembers the project to open next time', () => {
    const service = createService();
    expect(service.getAutoLoadProjectId()).toBeNull();
    expect(service.getAutoLoadProjectName()).toBeNull();

    service.setAutoLoadProject(new Project({ id: 7, name: 'Show' }));
    expect(service.getAutoLoadProjectId()).toBe(7);
    expect(service.getAutoLoadProjectName()).toBe('Show');

    // a project which has never been saved has no id yet
    service.setAutoLoadProject(new Project({ name: 'New' }));
    expect(service.getAutoLoadProjectId()).toBeNull();
    expect(service.getAutoLoadProjectName()).toBe('New');
  });
});
