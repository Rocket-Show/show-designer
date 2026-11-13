import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Project } from '../models/project';

// a device linked with the account of the user: a Rocket Show device logged in in its settings, or an Ember stick the
// designer linked when it was connected (see docs/fixture-library.md, section 8)
export interface UserDevice {
  id: number;
  kind: string;
  name: string;
  version: string;
  edition: string;
  lastSeen: string;
  compositions: number;
  sets: number;
  projects: number;
  firmwareVersion: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  // the authentication token
  token: string;
  tokenExpiration: Date;
  username: string;

  constructor(private http: HttpClient) {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    this.token = localStorage.getItem('token');
    this.tokenExpiration = undefined;
    if (localStorage.getItem('tokenExpiration')) {
      // stored as JSON (in quotes) by earlier versions, which couldn't read it back
      this.tokenExpiration = new Date(Date.parse(localStorage.getItem('tokenExpiration').replace(/"/g, '')));
    }
    this.username = localStorage.getItem('username');
  }

  // The credentials as the body of a form: an address with the password would end up in the logs of the web server.
  // Every character is encoded, as a password may hold ones which mean something in a form (e.g. "&", "=" or "+").
  private credentials(fields: { [name: string]: string }): [string, { headers: HttpHeaders }] {
    const body = Object.keys(fields)
      .map((name) => encodeURIComponent(name) + '=' + encodeURIComponent(fields[name]))
      .join('&');

    return [body, { headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) }];
  }

  // register a new user
  register(email: string, username: string, password: string, newsletter: boolean): Observable<any> {
    return this.http.post('register', ...this.credentials({ email, username, password, newsletter: String(newsletter) }));
  }

  // login a user in the api
  login(email: string, password: string): Observable<any> {
    return this.http.post('login', ...this.credentials({ email, password })).pipe(
      map((result: any) => {
        this.token = result.token;
        this.username = result.username;

        // the token expires one month from now
        this.tokenExpiration = new Date();
        this.tokenExpiration.setDate(this.tokenExpiration.getDate() + 30);

        // store to the local storage
        localStorage.setItem('token', this.token);
        localStorage.setItem('tokenExpiration', this.tokenExpiration.toISOString());
        localStorage.setItem('username', this.username);

        this.loadFromLocalStorage();
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiration');
    localStorage.removeItem('username');

    this.loadFromLocalStorage();
  }

  isLoggedIn(): boolean {
    if (!this.token) {
      return false;
    }

    if (new Date() > this.tokenExpiration) {
      this.logout();
      return false;
    }

    return true;
  }

  getHeaders(): HttpHeaders {
    if (!this.isLoggedIn()) {
      return null;
    }

    let headers = new HttpHeaders();
    headers = headers.append('Authorization', this.token);
    return headers;
  }

  // the devices linked with the account of the user
  getDevices(): Observable<UserDevice[]> {
    return this.http.get<UserDevice[]>('devices', { headers: this.getHeaders() });
  }

  // Unlink a device from the account of the user: it has no AI and no votes until it is linked again
  unlinkDevice(id: number): Observable<any> {
    const [body, options] = this.credentials({ id: String(id) });

    return this.http.post('device-unlink', body, { headers: options.headers.set('Authorization', this.token) });
  }

  setAutoLoadProject(project: Project) {
    localStorage.setItem('projectName', project.name);
    if (project.id) {
      localStorage.setItem('projectId', project.id.toString());
    } else {
      localStorage.removeItem('projectId');
    }
  }

  getAutoLoadProjectId(): number {
    if (!localStorage.getItem('projectId')) {
      return null;
    }
    return Number.parseInt(localStorage.getItem('projectId'), 10);
  }

  getAutoLoadProjectName(): string {
    return localStorage.getItem('projectName');
  }
}
