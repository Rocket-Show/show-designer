import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AiFixturesLookup, AiFixturesRequest, AiFixturesResponse, AiFixturesStatus, FixtureReview } from '../models/ai-fixtures';
import { UserService } from './user.service';

// The fixture profiles the AI makes from a manual (see docs/fixture-library.md, section 10), through the API the
// designer talks to: the one of the online designer for a logged in user, or a Rocket Show device, which forwards the
// requests with the account it is linked with.
@Injectable({
  providedIn: 'root',
})
export class AiFixturesService {
  constructor(private http: HttpClient, private userService: UserService) {}

  // can the user have profiles made, and how many more today
  getStatus(): Observable<AiFixturesStatus> {
    return this.http.get<AiFixturesStatus>('ai-fixtures', { headers: this.userService.getHeaders() });
  }

  // what the AI told about a version it made: where it read each channel in the manual (none for another version)
  getReview(uuid: string): Observable<FixtureReview> {
    return this.http
      .get<{ review: FixtureReview }>('ai-fixtures?review=' + encodeURIComponent(uuid))
      .pipe(map((response) => (response ? response.review : null)));
  }

  // The versions the library has of a fixture, by its manufacturer and model, and the ones made from the manual (by its
  // hash, so that it is not uploaded for this). Free, it asks no AI.
  lookup(manufacturerShortName: string, model: string, manualSha256: string): Observable<AiFixturesLookup> {
    return this.post<AiFixturesLookup>({ action: 'lookup', manufacturerShortName: manufacturerShortName || '', model, manualSha256 });
  }

  // a new profile made by the AI, stored as a version of the library; it takes up to a few minutes
  generate(request: AiFixturesRequest): Observable<AiFixturesResponse> {
    return this.post<AiFixturesResponse>({ action: 'generate', ...request });
  }

  // The SHA-256 of a manual in hex, which the library knows it by. Undefined where the browser can't work it out: only a
  // secure page (https, or the computer itself) has the cryptography of the browser.
  async sha256(file: Blob): Promise<string> {
    const subtle = globalThis.crypto?.subtle;

    if (!subtle) {
      return undefined;
    }

    const digest = await subtle.digest('SHA-256', await file.arrayBuffer());

    return Array.from(new Uint8Array(digest))
      .map((byte) => ('0' + byte.toString(16)).slice(-2))
      .join('');
  }

  // A form of the passed fields, the ones without a value left out. It has no content type: the browser sets the one of
  // a form, with the boundary between its parts (the application around the designer leaves a form alone as well).
  private post<T>(fields: { [name: string]: string | Blob }): Observable<T> {
    const form = new FormData();

    for (const name of Object.keys(fields)) {
      if (fields[name] !== undefined && fields[name] !== null) {
        form.append(name, fields[name]);
      }
    }

    return this.http.post<T>('ai-fixtures', form, { headers: this.userService.getHeaders() || new HttpHeaders() });
  }
}
