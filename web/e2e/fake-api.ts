import { BrowserContext, Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// where the app served for the tests finds the API (web/src/environments/environment.e2e.ts)
export const apiUrl = 'http://localhost:8080/api/';

// a profile of the fixture library: the metadata the search lists (`fixtures`) and the profile itself (`fixture`). A
// version of a fixture tells about itself as well (the VersionInfo of the API: origin, state, best, the states of its
// modes, ...), with the plain uuid of its fixture.
export interface LibraryProfile {
  uuid: string;
  name: string;
  manufacturerShortName: string;
  manufacturerName: string;
  mainCategory: string;
  profile: any;
  fixture?: string;
  best?: boolean;
  [field: string]: any;
}

// a request the designer sent to the API
export interface ApiRequest {
  method: string;
  // the script called, e.g. 'project'
  endpoint: string;
  params: { [name: string]: string };
  // the fields of a form sent as the body (like $_POST of PHP), e.g. the credentials; of a file the name of the file
  form: { [name: string]: string };
  authorization: string | undefined;
  body: any;
}

interface StoredProject {
  object: any;
  shareToken: string;
  ownerEmail: string | undefined;
  active: boolean;
}

interface User {
  email: string;
  username: string;
  password: string;
  newsletter: boolean;
}

// the test profiles of the conformance cases with Rocket Show, as the library of the online designer has them
function testProfile(file: string, manufacturerName: string): LibraryProfile {
  const profile = JSON.parse(readFileSync(join(__dirname, '../projects/designer/conformance/profiles/test', file), 'utf8'));

  return {
    uuid: 'test/' + file.replace('.json', ''),
    name: profile.name,
    manufacturerShortName: 'test',
    manufacturerName,
    mainCategory: profile.categories[0],
    profile,
  };
}

// The template every new project starts from (id 1): a project of the designer, exported and stored without its name
// and id, like README.md describes it. It plays one empty preset in one scene.
export function templateProject(): any {
  return {
    version: 10,
    uuid: 'template',
    selectedPresetUuid: 'template-preset',
    selectedSceneUuids: ['template-scene'],
    selectedStepUuid: 'template-step',
    previewPreset: false,
    masterDimmerValue: 1,
    presets: [{ uuid: 'template-preset', name: 'New Preset', sortIndex: 0, steps: [{ uuid: 'template-step', startMillis: 0 }] }],
    scenes: [{ uuid: 'template-scene', name: 'New Scene', sortIndex: 0, color: '#1f77b4', presetUuids: ['template-preset'] }],
    fixtures: [],
    presetFixtures: [],
    fixtureProfiles: [],
    universes: [],
    compositions: [],
  };
}

/**
 * The API of the online designer (show-designer-api/*.php in the spark repository), answered in the browser: the
 * designer talks to it like to the real one, the specs look into what it got and set up what it holds (users, projects,
 * failures). One instance is the server of one test, also for a second browser context (e.g. a friend opening a share
 * link).
 */
export class FakeApi {
  readonly library: LibraryProfile[] = [testProfile('rgb-par.json', 'Test'), testProfile('moving-head.json', 'Test')];

  // the template is the project with id 1, readable by anyone
  readonly projects = new Map<number, StoredProject>([
    [1, { object: templateProject(), shareToken: 'template-share-token', ownerEmail: undefined, active: true }],
  ]);
  readonly users: User[] = [];
  // the sessions of the logged in users: the token sent in the Authorization header, and whose it is
  readonly sessions = new Map<string, string>();
  readonly requests: ApiRequest[] = [];

  // The AI looks (see show-designer-api/ai-looks.php in the spark repository): whether they can be used, the looks
  // the AI answers in this test (each request takes the next one, the last one again), how many requests a user may make
  // a day, and how long the AI takes to answer
  aiAvailable = true;
  aiLooks: any[] = [];
  aiRequestsPerUserPerDay = 20;
  aiDelayMillis = 0;
  private readonly aiRequests = new Map<string, number>();

  // The profiles the AI makes from a manual (see show-designer-api/ai-fixtures.php in the spark repository): what the
  // lookup finds in the library, and the profile, its version and its review the AI answers with
  aiFixturesFound: any[] = [];
  aiFixture: { version: any; profile: any; review: any } | undefined;

  // the votes on the modes of the versions, by the uuid of the version, the mode and the user (see fixture-vote.php)
  readonly votes = new Map<string, { good: boolean; comment?: string }>();

  // the endpoints which fail (e.g. 'GET project'), with the status and the error they answer
  private readonly failures = new Map<string, { status: number; error: string }>();

  private nextProjectId = 2;
  private nextSession = 1;

  // let the library offer one more of the test profiles, e.g. addTestProfile('pixel-bar.json')
  addTestProfile(file: string) {
    this.library.push(testProfile(file, 'Test'));
  }

  // Let the library hold a test profile as a version of its fixture, e.g. addVersion('rgb-par.json', 2, { best: true }).
  // The search lists the versions then, the plain uuid of the fixture still answers for older projects.
  addVersion(file: string, id: number, info: { [field: string]: any }): LibraryProfile {
    const profile = testProfile(file, 'Test');
    const version = { ...profile, uuid: profile.uuid + '~' + id, fixture: profile.uuid, ...info };
    const plain = this.library.find((entry) => entry.uuid === profile.uuid);

    if (plain) {
      plain.best = false;
    }

    this.library.push(version);

    return version;
  }

  async attach(context: BrowserContext) {
    await context.route(apiUrl + '**', (route) => this.answer(route));
  }

  // a user who registered before
  addUser(email: string, username: string, password: string) {
    this.users.push({ email, username, password, newsletter: false });
  }

  // a project saved before by the passed user, returns its id
  addProject(ownerEmail: string, project: any): number {
    const id = this.nextProjectId++;
    this.projects.set(id, { object: { ...project, id }, shareToken: 'share-token-' + id, ownerEmail, active: true });
    return id;
  }

  // the project as it has been saved last
  savedProject(id: number): any {
    return this.projects.get(id)?.object;
  }

  // let an endpoint answer with an error from now on, e.g. fail('GET project', 500, 'internal')
  fail(methodAndEndpoint: string, status: number, error: string) {
    this.failures.set(methodAndEndpoint, { status, error });
  }

  requestsTo(methodAndEndpoint: string): ApiRequest[] {
    return this.requests.filter((request) => request.method + ' ' + request.endpoint === methodAndEndpoint);
  }

  // a profile of the library as the designer keeps it in a project: the metadata and the profile in one
  projectProfile(uuid: string): any {
    const { profile, ...metadata } = this.library.find((entry) => entry.uuid === uuid);
    return { ...metadata, ...profile };
  }

  // the template project, to be changed before the designer opens it
  get template(): any {
    return this.projects.get(1).object;
  }

  // let the template come with fixtures of the library, patched one after another into its universe in their first
  // mode, e.g. patchTemplate({ profile: 'test/rgb-par', name: 'Par left' })
  patchTemplate(...fixtures: { profile: string; name: string }[]) {
    const template = this.template;
    const universe = { uuid: 'universe-1', name: 'Universe 1' };
    let channel = 0;

    template.universes = [universe];

    fixtures.forEach((fixture, index) => {
      const profile = this.projectProfile(fixture.profile);
      const mode = profile.modes[0];
      const uuid = 'fixture-' + (index + 1);

      if (!template.fixtureProfiles.some((existing: any) => existing.uuid === profile.uuid)) {
        template.fixtureProfiles.push(profile);
      }
      template.fixtures.push({
        uuid,
        profileUuid: profile.uuid,
        name: fixture.name,
        modeShortName: mode.shortName,
        dmxUniverseUuid: universe.uuid,
        dmxFirstChannel: channel,
      });
      template.presetFixtures.push({ fixtureUuid: uuid, sortIndex: index });
      channel += mode.channels.length;
    });
  }

  private async answer(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace('/api/', '');
    const params = Object.fromEntries(url.searchParams.entries());
    const text = request.postData();
    let body: any;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    const contentType = request.headers()['content-type'] ?? '';
    const isForm = contentType.startsWith('application/x-www-form-urlencoded');
    const form =
      isForm && text ? Object.fromEntries(new URLSearchParams(text).entries()) : multipartForm(contentType, request.postDataBuffer());
    const authorization = request.headers()['authorization'];
    this.requests.push({ method: request.method(), endpoint, params, form, authorization, body });

    // the requests are sent with credentials: the origin is named, a wildcard is refused by the browser (see global.php)
    const answer = (data: any, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: data === undefined ? '' : JSON.stringify(data),
        headers: { 'Access-Control-Allow-Origin': request.headers()['origin'] ?? '*', 'Access-Control-Allow-Credentials': 'true' },
      });
    const error = (message: string, status: number) => answer({ error: message }, status);

    const failure = this.failures.get(request.method() + ' ' + endpoint);
    if (failure) {
      return error(failure.error, failure.status);
    }

    const userEmail = authorization ? this.sessions.get(authorization) : undefined;

    switch (request.method() + ' ' + endpoint) {
      case 'GET project': {
        // see show-designer-api/project.php in the spark repository
        const id = Number(params.id);
        const stored = this.projects.get(id);
        const authorized =
          id === 1 ||
          (userEmail !== undefined && stored?.ownerEmail === userEmail) ||
          (!!params.token && stored?.shareToken === params.token);

        if (!params.id) {
          return error('missing-parameters', 400);
        }
        if (!authorized) {
          return error('no-permission', 403);
        }
        if (!stored || !stored.active) {
          return error('wrong-id', 400);
        }
        return answer({ ...stored.object, shareToken: stored.shareToken });
      }
      case 'POST project': {
        if (!userEmail) {
          return error('unauthorized', 401);
        }
        if (!body || typeof body !== 'object') {
          return error('wrong-parameters', 400);
        }
        const existing = body.id ? this.projects.get(Number(body.id)) : undefined;
        if (existing) {
          if (existing.ownerEmail !== userEmail) {
            return error('unauthorized', 401);
          }
          existing.object = body;
          return answer({ id: Number(body.id), shareToken: existing.shareToken });
        }
        // the server hands out the share token, the one of the template the project started from is not taken over
        const id = this.nextProjectId++;
        this.projects.set(id, { object: body, shareToken: 'share-token-' + id, ownerEmail: userEmail, active: true });
        return answer({ id, shareToken: 'share-token-' + id });
      }
      case 'DELETE project': {
        const stored = this.projects.get(Number(params.id));
        if (!userEmail || !stored || stored.ownerEmail !== userEmail) {
          return error('unauthorized', 401);
        }
        stored.active = false;
        return answer(undefined);
      }
      case 'GET projects':
        if (!userEmail) {
          return error('unauthorized', 401);
        }
        // the ids come as text out of the database
        return answer(
          [...this.projects.entries()]
            .filter(([, stored]) => stored.active && stored.ownerEmail === userEmail)
            .map(([id, stored]) => ({ id: String(id), name: stored.object.name, roleAlias: 'manager' }))
        );
      case 'GET fixtures': {
        // all versions of the fixture of a version, the best one first; else the best version of each fixture
        const fixtureOf = (uuid: string) => this.library.find((entry) => entry.uuid === uuid)?.fixture ?? uuid;
        const versions = params.fixture
          ? this.library
              .filter((entry) => (entry.fixture ?? entry.uuid) === fixtureOf(params.fixture))
              .sort((entry1, entry2) => Number(!!entry2.best) - Number(!!entry1.best))
          : this.library
              .filter((entry) => (params.uuid ? entry.uuid === params.uuid : entry.best !== false))
              .filter((entry) => !params.mainCategory || entry.mainCategory === params.mainCategory)
              .sort((entry1, entry2) => (entry1.manufacturerName + entry1.name).localeCompare(entry2.manufacturerName + entry2.name));
        return answer(versions.map(({ profile, ...metadata }) => metadata));
      }
      case 'GET fixture':
        return answer(this.library.find((entry) => entry.uuid === params.uuid)?.profile ?? null);
      case 'GET manufacturer':
        return answer([{ shortName: 'test', name: 'Test', website: null }]);
      case 'POST register':
        if (!form.email || !form.username || !form.password) {
          return error('missing-parameters', 400);
        }
        if (this.users.some((user) => user.email === form.email)) {
          return error('email-exists', 400);
        }
        this.users.push({
          email: form.email,
          username: form.username,
          password: form.password,
          newsletter: form.newsletter === 'true',
        });
        return answer(undefined);
      case 'POST login': {
        const user = this.users.find((candidate) => candidate.email === form.email && candidate.password === form.password);
        if (!user) {
          return error('wrong-credentials', 400);
        }
        const token = 'session-' + this.nextSession++;
        this.sessions.set(token, user.email);
        return answer({ token, username: user.username });
      }
      case 'GET ai-looks':
      case 'POST ai-looks': {
        if (!userEmail) {
          return error('unauthorized', 401);
        }
        const used = this.aiRequests.get(userEmail) || 0;
        const usage = { requestsLast24Hours: used, requestsPerUserPerDay: this.aiRequestsPerUserPerDay };
        if (request.method() === 'GET') {
          return answer(this.aiAvailable ? { available: true, ...usage } : { available: false });
        }
        if (!this.aiAvailable) {
          return error('ai-unavailable', 503);
        }
        if (used >= this.aiRequestsPerUserPerDay) {
          return error('ai-user-limit-reached', 429);
        }
        if (!body?.rig?.groups?.length) {
          return answer({ error: 'invalid-request', detail: 'rig.groups lists 1 to 32 groups.' }, 400);
        }
        this.aiRequests.set(userEmail, used + 1);
        if (this.aiDelayMillis > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.aiDelayMillis));
        }
        const looks = this.aiLooks[Math.min(used, this.aiLooks.length - 1)];
        return answer({ looks, requestsLast24Hours: used + 1, requestsPerUserPerDay: this.aiRequestsPerUserPerDay });
      }
      case 'GET fixture-vote':
      case 'POST fixture-vote':
      case 'DELETE fixture-vote': {
        const uuid = body?.uuid ?? params.uuid;
        const version = this.library.find((entry) => entry.uuid === uuid);
        if (request.method() !== 'GET' && !userEmail) {
          return error('unauthorized', 401);
        }
        if (!version) {
          return error('unknown-version', 404);
        }
        if (request.method() === 'POST') {
          this.votes.set([uuid, body.mode, userEmail].join('/'), { good: body.good, comment: body.comment });
        } else if (request.method() === 'DELETE') {
          this.votes.delete([uuid, params.mode, userEmail].join('/'));
        }
        // the votes are counted at once, a mode is confirmed by a good vote here (two on the server)
        const modes = (version.modeStates ?? []).map((mode: any) => {
          const votes = [...this.votes.entries()]
            .filter(([key]) => key.startsWith(uuid + '/' + mode.shortName + '/'))
            .map(([, vote]) => vote);
          const good = mode.good + votes.filter((vote) => vote.good).length;
          const bad = mode.bad + votes.filter((vote) => !vote.good).length;
          return {
            shortName: mode.shortName,
            hash: mode.hash,
            state: good > bad ? 'confirmed' : bad > good ? 'problem' : mode.state,
            good,
            bad,
            comments: votes.filter((vote) => !vote.good && vote.comment).map((vote) => vote.comment),
            myVote: (userEmail && this.votes.get([uuid, mode.shortName, userEmail].join('/'))) || null,
          };
        });
        return answer({ modes });
      }
      case 'GET ai-fixtures':
      case 'POST ai-fixtures': {
        if (params.review !== undefined) {
          return answer({ review: this.aiFixture?.version.uuid === params.review ? this.aiFixture.review : null });
        }
        if (!userEmail) {
          return error('unauthorized', 401);
        }
        const usage = { requestsLast24Hours: this.aiRequests.get(userEmail) || 0, requestsPerUserPerDay: this.aiRequestsPerUserPerDay };
        if (request.method() === 'GET') {
          return answer({ available: this.aiAvailable, ...usage, maxManualBytes: 33554432, maxInputTokens: 400000 });
        }
        if (form.action === 'lookup') {
          return answer({ versions: this.aiFixturesFound, manualKnown: false });
        }
        if (form.action !== 'generate' || !form.model || !this.aiFixture) {
          return error('wrong-parameters', 400);
        }
        this.aiRequests.set(userEmail, usage.requestsLast24Hours + 1);
        return answer({
          ...this.aiFixture,
          requestsLast24Hours: usage.requestsLast24Hours + 1,
          requestsPerUserPerDay: usage.requestsPerUserPerDay,
        });
      }
      default:
        return error('not-found', 404);
    }
  }
}

// The fields of a form sent as multipart/form-data (like $_POST of PHP, a file by its name), e.g. a manual for the AI
function multipartForm(contentType: string, body: Buffer | null): { [name: string]: string } {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  const form: { [name: string]: string } = {};

  if (!boundary || !body) {
    return form;
  }

  for (const part of body.toString('latin1').split('--' + boundary)) {
    const [headers, ...content] = part.split('\r\n\r\n');
    const name = /name="([^"]*)"/.exec(headers)?.[1];
    const file = /filename="([^"]*)"/.exec(headers)?.[1];

    if (name !== undefined) {
      form[name] = file ?? content.join('\r\n\r\n').replace(/\r\n$/, '');
    }
  }

  return form;
}
