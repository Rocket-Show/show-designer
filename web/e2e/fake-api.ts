import { BrowserContext, Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// where the dev build of the app finds the API (web/src/environments/environment.ts)
export const apiUrl = 'http://localhost:8080/api/';

// a profile of the fixture library: the metadata the search lists (`fixtures`) and the profile itself (`fixture`)
export interface LibraryProfile {
  uuid: string;
  name: string;
  manufacturerShortName: string;
  manufacturerName: string;
  mainCategory: string;
  profile: any;
}

// a request the designer sent to the API
export interface ApiRequest {
  method: string;
  // the script called, e.g. 'project'
  endpoint: string;
  params: { [name: string]: string };
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
 * The API of the online designer (api/*.php), answered in the browser: the designer talks to it like to the real one,
 * the specs look into what it got and set up what it holds (users, projects, failures). One instance is the server of
 * one test, also for a second browser context (e.g. a friend opening a share link).
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

  // the endpoints which fail (e.g. 'GET project'), with the status and the error they answer
  private readonly failures = new Map<string, { status: number; error: string }>();

  private nextProjectId = 2;
  private nextSession = 1;

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
    const authorization = request.headers()['authorization'];
    this.requests.push({ method: request.method(), endpoint, params, authorization, body });

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
        // see api/project.php
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
      case 'GET fixtures':
        return answer(
          this.library
            .filter((entry) => !params.uuid || entry.uuid === params.uuid)
            .filter((entry) => !params.mainCategory || entry.mainCategory === params.mainCategory)
            .sort((entry1, entry2) => (entry1.manufacturerName + entry1.name).localeCompare(entry2.manufacturerName + entry2.name))
            .map(({ profile, ...metadata }) => metadata)
        );
      case 'GET fixture':
        return answer(this.library.find((entry) => entry.uuid === params.uuid)?.profile ?? null);
      case 'GET manufacturer':
        return answer([{ shortName: 'test', name: 'Test', website: null }]);
      case 'POST register':
        if (!params.email || !params.username || !params.password) {
          return error('missing-parameters', 400);
        }
        if (this.users.some((user) => user.email === params.email)) {
          return error('email-exists', 400);
        }
        this.users.push({
          email: params.email,
          username: params.username,
          password: params.password,
          newsletter: params.newsletter === 'true',
        });
        return answer(undefined);
      case 'POST login': {
        const user = this.users.find((candidate) => candidate.email === params.email && candidate.password === params.password);
        if (!user) {
          return error('wrong-credentials', 400);
        }
        const token = 'session-' + this.nextSession++;
        this.sessions.set(token, user.email);
        return answer({ token, username: user.username });
      }
      default:
        return error('not-found', 404);
    }
  }
}
