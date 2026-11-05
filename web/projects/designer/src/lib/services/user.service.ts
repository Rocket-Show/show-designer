import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Project } from '../models/project';

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

  // register a new user
  register(email: string, username: string, password: string, newsletter: boolean): Observable<any> {
    // the address carries them: a password may hold characters which mean something in it (e.g. "&" or "+")
    return this.http.post(
      'register?email=' +
        encodeURIComponent(email) +
        '&username=' +
        encodeURIComponent(username) +
        '&password=' +
        encodeURIComponent(password) +
        '&newsletter=' +
        newsletter,
      null
    );
  }

  // login a user in the api
  login(email: string, password: string): Observable<any> {
    return this.http.post('login?email=' + encodeURIComponent(email) + '&password=' + encodeURIComponent(password), null).pipe(
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
