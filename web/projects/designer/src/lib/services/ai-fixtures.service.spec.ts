import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AiFixturesService } from './ai-fixtures.service';
import { UserService } from './user.service';

// The requests for profiles made by the AI: the status, the review, and the forms of a lookup and of a profile with
// its manual, which the browser gives the type of a form.
describe('AiFixturesService', () => {
  let service: AiFixturesService;
  let http: HttpTestingController;
  let headers: HttpHeaders;

  beforeEach(() => {
    headers = new HttpHeaders({ Authorization: 'session' });

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: UserService, useValue: { getHeaders: () => headers } }],
    });

    service = TestBed.inject(AiFixturesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // the fields of a form sent
  function fields(body: FormData): { [name: string]: any } {
    const result: { [name: string]: any } = {};
    body.forEach((value, name) => (result[name] = value));
    return result;
  }

  it('asks whether the user can have profiles made', () => {
    let status: any;

    service.getStatus().subscribe((result) => (status = result));
    const request = http.expectOne('ai-fixtures');
    request.flush({ available: true, requestsLast24Hours: 1, requestsPerUserPerDay: 5 });

    expect(request.request.headers.get('Authorization')).toBe('session');
    expect(status.requestsPerUserPerDay).toBe(5);
  });

  it('reads the review of a generated version, and none of another one', () => {
    const reviews: any[] = [];

    service.getReview('acme/par~2').subscribe((review) => reviews.push(review));
    http.expectOne('ai-fixtures?review=acme%2Fpar~2').flush({ review: { channels: {}, uncertain: [] } });
    service.getReview('acme/par~1').subscribe((review) => reviews.push(review));
    http.expectOne('ai-fixtures?review=acme%2Fpar~1').flush({ review: null });
    service.getReview('acme/par~0').subscribe((review) => reviews.push(review));
    http.expectOne('ai-fixtures?review=acme%2Fpar~0').flush(null);

    expect(reviews).toEqual([{ channels: {}, uncertain: [] }, null, null]);
  });

  it('looks a fixture up with a form, which leaves its type to the browser', () => {
    let found: any;

    service.lookup('acme', 'Par 64', 'abc').subscribe((result) => (found = result));
    service.lookup(undefined, 'Par 64', '').subscribe();

    const [lookup, withoutManufacturer] = http.match('ai-fixtures');

    expect(lookup.request.method).toBe('POST');
    expect(lookup.request.headers.get('Authorization')).toBe('session');
    expect(lookup.request.headers.has('Content-Type')).toBe(false);
    expect(fields(lookup.request.body)).toEqual({ action: 'lookup', manufacturerShortName: 'acme', model: 'Par 64', manualSha256: 'abc' });
    expect(fields(withoutManufacturer.request.body).manufacturerShortName).toBe('');

    lookup.flush({ versions: [], manualKnown: false });
    withoutManufacturer.flush({ versions: [], manualKnown: false });

    expect(found).toEqual({ versions: [], manualKnown: false });
  });

  it('sends the manual along to have a profile made, without the login of the designer where the host holds it', () => {
    headers = null;
    const manual = new File(['%PDF'], 'par.pdf', { type: 'application/pdf' });

    service.generate({ manual, manufacturerShortName: 'acme', model: 'Par 64', link: undefined, mode: null }).subscribe();

    const request = http.expectOne('ai-fixtures');
    const sent = fields(request.request.body);

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(Object.keys(sent)).toEqual(['action', 'manual', 'manufacturerShortName', 'model']);
    expect(sent.action).toBe('generate');
    expect(sent.manual.name).toBe('par.pdf');
    request.flush({});
  });

  it('works the SHA-256 of a manual out in hex', async () => {
    expect(await service.sha256(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('has no SHA-256 where the page has no cryptography (not served securely)', async () => {
    spyOnProperty(Crypto.prototype, 'subtle', 'get').and.returnValue(undefined);

    expect(await service.sha256(new Blob(['abc']))).toBeUndefined();
  });
});
