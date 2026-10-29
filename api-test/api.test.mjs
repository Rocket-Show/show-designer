// The API of the online designer (api/), served by PHP's built-in server on a database of its own.
// See README.md for how to run it.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

const here = new URL('.', import.meta.url).pathname;
let root;
let errorLog;
let server;
let baseUrl;

// a port nobody listens on
function freePort() {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

before(async () => {
  // a copy of the API, with the database of the tests in place of the one it is deployed with
  root = mkdtempSync(join(tmpdir(), 'designer-api-'));
  cpSync(join(here, '../api'), root, { recursive: true });
  cpSync(join(here, 'database.php'), join(root, 'database.php'));
  errorLog = join(root, 'php-errors.log');

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}/`;
  server = spawn(
    'php',
    [
      '-d',
      'error_reporting=E_ALL',
      '-d',
      'display_errors=0',
      '-d',
      'log_errors=1',
      '-d',
      `error_log=${errorLog}`,
      '-S',
      `127.0.0.1:${port}`,
      '-t',
      root,
      join(here, 'router.php'),
    ],
    { stdio: 'ignore' }
  );

  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl + 'manufacturer');
      break;
    } catch (error) {
      if (attempt > 50) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
});

after(() => {
  server.kill();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  execFileSync('php', [join(here, 'db.php'), 'reset']);
  writeFileSync(errorLog, '');
});

// what PHP complained about while answering (a warning or a notice is a bug as well)
function phpErrors() {
  return readFileSync(errorLog, 'utf8')
    .split('\n')
    .filter((line) => line.includes('PHP '));
}

function sql(statements) {
  return JSON.parse(
    execFileSync('php', [join(here, 'db.php'), 'query', statements], {
      encoding: 'utf8',
    })
  );
}

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    body,
    headers: { ...(token ? { Authorization: token } : {}), ...headers },
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  return { status: response.status, text, json, headers: response.headers };
}

const query = (parameters) => new URLSearchParams(parameters).toString();

async function register(email, password = 'secret', username = 'User') {
  return api('register?' + query({ email, username, password, newsletter: 'false' }), { method: 'POST' });
}

// a registered user, logged in: the token of the session
async function user(email = 'user@example.com', password = 'secret') {
  await register(email, password);
  const response = await api('login?' + query({ email, password }), {
    method: 'POST',
  });
  assert.equal(response.status, 200, response.text);
  return response.json.token;
}

async function save(token, project) {
  return api('project', {
    method: 'POST',
    token,
    body: JSON.stringify({ compositions: [], ...project }),
  });
}

describe('registering', () => {
  it('stores a user with the password hashed', async () => {
    const response = await api(
      'register?' +
        query({
          email: 'me+show@example.com',
          username: 'Rock & Roll',
          password: 'p&ss=w#rd+',
          newsletter: 'true',
        }),
      {
        method: 'POST',
      }
    );

    assert.equal(response.status, 200);
    const [stored] = sql('SELECT email, username, password, newsletter, active FROM user');
    assert.equal(stored.email, 'me+show@example.com');
    assert.equal(stored.username, 'Rock & Roll');
    assert.match(stored.password, /^\$2y\$/);
    assert.equal(stored.newsletter, '1');
    assert.equal(stored.active, '1');
    assert.deepEqual(phpErrors(), []);
  });

  it('registers an email once', async () => {
    await register('me@example.com');

    const again = await register('me@example.com');

    assert.equal(again.status, 400);
    assert.deepEqual(again.json, { error: 'email-exists' });
    assert.equal(sql('SELECT COUNT(*) users FROM user')[0].users, '1');
  });

  it('wants an email, a name and a password', async () => {
    for (const parameters of [
      { username: 'User', password: 'secret' },
      { email: 'me@example.com', password: 'secret' },
      { email: 'me@example.com', username: 'User' },
    ]) {
      const response = await api('register?' + query(parameters), {
        method: 'POST',
      });

      assert.equal(response.status, 400);
      assert.deepEqual(response.json, { error: 'missing-parameters' });
    }

    assert.equal(sql('SELECT COUNT(*) users FROM user')[0].users, '0');
    assert.deepEqual(phpErrors(), []);
  });

  it('leaves the newsletter to those who ask for it', async () => {
    await api(
      'register?' +
        query({
          email: 'me@example.com',
          username: 'User',
          password: 'secret',
        }),
      { method: 'POST' }
    );

    assert.equal(sql('SELECT newsletter FROM user')[0].newsletter, '0');
  });
});

describe('logging in', () => {
  it('opens a session for the right credentials', async () => {
    await register('me@example.com', 'secret', 'Moritz');

    const response = await api('login?' + query({ email: 'me@example.com', password: 'secret' }), { method: 'POST' });

    assert.equal(response.status, 200);
    assert.equal(response.json.username, 'Moritz');
    assert.match(response.json.token, /^[0-9a-f]{52}$/);
    assert.equal(sql('SELECT token FROM session')[0].token, response.json.token);
  });

  it('refuses a wrong password, an unknown email and an inactive user alike', async () => {
    await register('me@example.com');
    await register('gone@example.com');
    sql("UPDATE user SET active = 0 WHERE email = 'gone@example.com'");

    for (const credentials of [
      { email: 'me@example.com', password: 'wrong' },
      { email: 'nobody@example.com', password: 'secret' },
      { email: 'gone@example.com', password: 'secret' },
      { email: "me@example.com' OR '1' = '1", password: 'secret' },
      {},
    ]) {
      const response = await api('login?' + query(credentials), {
        method: 'POST',
      });

      assert.equal(response.status, 400);
      assert.deepEqual(response.json, { error: 'wrong-credentials' });
    }

    assert.equal(sql('SELECT COUNT(*) sessions FROM session')[0].sessions, '0');
    assert.deepEqual(phpErrors(), []);
  });

  it('logs in with special characters in the credentials', async () => {
    const response = await api('login?' + query({ email: 'me+show@example.com', password: 'p&ss=w#rd+' }), { method: 'POST' });
    assert.equal(response.status, 400);

    await register('me+show@example.com', 'p&ss=w#rd+');

    const loggedIn = await api('login?' + query({ email: 'me+show@example.com', password: 'p&ss=w#rd+' }), { method: 'POST' });
    assert.equal(loggedIn.status, 200);
  });

  // the old designer put the credentials into the address as they were typed: a "+" arrived
  // as a space and an "&" or a "#" cut off the rest, which is how such a user was stored
  it('finds a user registered by the old designer', async () => {
    await api('register?email=me+show@example.com&username=User&password=p&ss=w#rd', { method: 'POST' });
    assert.equal(sql('SELECT email FROM user')[0].email, 'me show@example.com');

    const response = await api('login?' + query({ email: 'me+show@example.com', password: 'p&ss=w#rd' }), { method: 'POST' });

    assert.equal(response.status, 200);
    assert.deepEqual(phpErrors(), []);
  });
});

describe('the projects of a user', () => {
  it('lists the active projects of the user only', async () => {
    const mine = await user('me@example.com');
    const other = await user('other@example.com');
    const kept = (await save(mine, { name: 'Kept' })).json.id;
    const deleted = (await save(mine, { name: 'Deleted' })).json.id;
    await save(other, { name: 'Other' });
    await api('project?id=' + deleted, { method: 'DELETE', token: mine });

    const response = await api('projects', { token: mine });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, [{ id: String(kept), name: 'Kept', roleAlias: 'manager' }]);
    assert.deepEqual(phpErrors(), []);
  });

  it('lists nothing without a session', async () => {
    for (const token of [undefined, 'unknown']) {
      const response = await api('projects', { token });

      assert.equal(response.status, 401);
      assert.deepEqual(response.json, { error: 'unauthorized' });
    }
  });
});

describe('saving a project', () => {
  it('stores a new project with a share token of its own', async () => {
    const token = await user();

    // the token of the template, which anyone can read, is not taken over
    const response = await save(token, {
      name: "Rock 'n' Roll",
      shareToken: 'of-the-template',
      presets: [{ uuid: 'p' }],
    });

    assert.equal(response.status, 200);
    assert.match(response.json.shareToken, /^[0-9a-f]{32}$/);
    const [stored] = sql('SELECT id, name, share_token, object FROM project WHERE id = ' + response.json.id);
    assert.equal(stored.name, "Rock 'n' Roll");
    assert.equal(stored.share_token, response.json.shareToken);
    assert.deepEqual(JSON.parse(stored.object).presets, [{ uuid: 'p' }]);
    assert.equal(sql('SELECT alias FROM project_user_role JOIN project_role ON project_role.id = role_id')[0].alias, 'manager');
    assert.deepEqual(phpErrors(), []);
  });

  it('stores a project as large as a show with many pixels', async () => {
    const token = await user();
    const presets = Array.from({ length: 2000 }, (_, index) => ({
      uuid: 'preset-' + index,
      name: 'A preset with a long name ' + index,
    }));

    const response = await save(token, { name: 'Large', presets });

    assert.equal(response.status, 200);
    assert.equal(JSON.parse(sql('SELECT object FROM project WHERE id = ' + response.json.id)[0].object).presets.length, 2000);
  });

  it('updates a project of its manager, keeping its share token', async () => {
    const token = await user();
    const { id, shareToken } = (await save(token, { name: 'Show' })).json;

    const response = await save(token, {
      id,
      name: 'Renamed',
      shareToken: 'another',
    });

    assert.deepEqual(response.json, { id, shareToken });
    assert.equal(sql('SELECT name FROM project WHERE id = ' + id)[0].name, 'Renamed');
    assert.equal(sql('SELECT COUNT(*) projects FROM project')[0].projects, '2');
  });

  it('gives a project stored without a share token one', async () => {
    const token = await user();
    const { id } = (await save(token, { name: 'Show' })).json;
    sql("UPDATE project SET share_token = '' WHERE id = " + id);

    const response = await save(token, { id, name: 'Show' });

    assert.match(response.json.shareToken, /^[0-9a-f]{32}$/);
  });

  it('keeps others from saving over a project', async () => {
    const owner = await user('owner@example.com');
    const other = await user('other@example.com');
    const { id } = (await save(owner, { name: 'Mine' })).json;

    const response = await save(other, { id, name: 'Taken' });

    assert.equal(response.status, 401);
    assert.equal(sql('SELECT name FROM project WHERE id = ' + id)[0].name, 'Mine');
  });

  it('lets an admin save over any project', async () => {
    const owner = await user('owner@example.com');
    const admin = await user('admin@example.com');
    sql(
      "INSERT INTO user_role(user_id, role_id) SELECT user.id, role.id FROM user, role WHERE user.email = 'admin@example.com' AND role.alias = 'admin'"
    );
    const { id } = (await save(owner, { name: 'Mine' })).json;

    const response = await save(admin, { id, name: 'Fixed by the admin' });

    assert.equal(response.status, 200);
    assert.equal(sql('SELECT name FROM project WHERE id = ' + id)[0].name, 'Fixed by the admin');
  });

  it('saves nothing without a session', async () => {
    const response = await save(undefined, { name: 'Show' });

    assert.equal(response.status, 401);
    assert.equal(sql('SELECT COUNT(*) projects FROM project')[0].projects, '1');
  });

  it('refuses what is no project', async () => {
    const token = await user();

    for (const body of ['not json', '[]', '"a text"']) {
      const response = await api('project', { method: 'POST', token, body });

      assert.equal(response.status, 400, body);
      assert.deepEqual(response.json, { error: 'wrong-parameters' });
    }

    assert.equal(sql('SELECT COUNT(*) projects FROM project')[0].projects, '1');
    assert.deepEqual(phpErrors(), []);
  });

  it('keeps the audio files of its compositions, and lets go of the others', async () => {
    const token = await user();
    const file = (uuid, projectId) =>
      `INSERT INTO composition_file(composition_uuid, project_id, name, size_bytes, type) VALUES('${uuid}', ${projectId}, '${uuid}.mp3', 3, 'audio/mpeg');`;
    sql(file('song', 'NULL') + file('dropped', 'NULL'));
    writeFileSync(join(root, 'composition-files', 'song.mp3'), 'mp3');
    writeFileSync(join(root, 'composition-files', 'dropped.mp3'), 'mp3');

    const { id } = (
      await save(token, {
        name: 'Show',
        compositions: [{ uuid: 'song' }, { uuid: 'dropped' }],
      })
    ).json;
    assert.deepEqual(sql('SELECT composition_uuid, project_id FROM composition_file ORDER BY composition_uuid'), [
      { composition_uuid: 'dropped', project_id: String(id) },
      { composition_uuid: 'song', project_id: String(id) },
    ]);

    await save(token, { id, name: 'Show', compositions: [{ uuid: 'song' }] });

    assert.deepEqual(sql('SELECT composition_uuid FROM composition_file'), [{ composition_uuid: 'song' }]);
    assert.equal(existsSync(join(root, 'composition-files', 'dropped.mp3')), false);
    assert.equal(existsSync(join(root, 'composition-files', 'song.mp3')), true);
  });

  it('cleans up the audio files of projects never saved after a month', async () => {
    const token = await user();
    sql(
      "INSERT INTO composition_file(composition_uuid, project_id, name, size_bytes, type, created) VALUES('old', NULL, 'old.mp3', 3, 'audio/mpeg', CURRENT_DATE() - INTERVAL 31 DAY), ('new', NULL, 'new.mp3', 3, 'audio/mpeg', CURRENT_DATE())"
    );
    writeFileSync(join(root, 'composition-files', 'old.mp3'), 'mp3');

    await save(token, { name: 'Show' });

    assert.deepEqual(sql('SELECT composition_uuid FROM composition_file'), [{ composition_uuid: 'new' }]);
    assert.equal(existsSync(join(root, 'composition-files', 'old.mp3')), false);
  });
});

describe('opening a project', () => {
  it('opens the template to anyone', async () => {
    sql(`UPDATE project SET object = '{"name":"New Project","presets":[]}' WHERE id = 1`);

    const response = await api('project?id=1');

    assert.equal(response.status, 200);
    assert.equal(response.json.name, 'New Project');
    assert.deepEqual(phpErrors(), []);
  });

  it('opens a project to its manager, with its share token', async () => {
    const token = await user();
    // a number with a fraction of 0 (as Rocket Show writes one) comes back as it was saved
    const body = '{"name":"Show","shareToken":"stale","compositions":[],"masterDimmerValue":1.0}';
    const { id, shareToken } = (await api('project', { method: 'POST', token, body })).json;

    const response = await api('project?' + query({ id, name: 'Show' }), {
      token,
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.name, 'Show');
    assert.equal(response.json.shareToken, shareToken);
    assert.match(response.text, /"masterDimmerValue":1\.0/);
  });

  it('opens a project to anyone with its share link', async () => {
    const owner = await user();
    const { id, shareToken } = (await save(owner, { name: 'Show' })).json;

    assert.equal((await api('project?' + query({ id, token: shareToken }))).status, 200);
    for (const token of ['wrong', '', "' OR '1' = '1"]) {
      assert.equal((await api('project?' + query({ id, token }))).status, 403, token);
    }

    // the designer asks to have it shared
    const withoutLink = await api('project?id=' + id);
    assert.equal(withoutLink.status, 403);
    assert.deepEqual(withoutLink.json, { error: 'no-permission' });
  });

  it('opens a project stored without a share token to its manager only', async () => {
    const owner = await user();
    const { id } = (await save(owner, { name: 'Show' })).json;
    sql("UPDATE project SET share_token = '' WHERE id = " + id);

    assert.equal((await api('project?' + query({ id, token: '' }))).status, 403);
    assert.equal((await api('project?id=' + id, { token: owner })).status, 200);
  });

  it('keeps a project from other users, but not from an admin', async () => {
    const owner = await user('owner@example.com');
    const other = await user('other@example.com');
    const admin = await user('admin@example.com');
    sql(
      "INSERT INTO user_role(user_id, role_id) SELECT user.id, role.id FROM user, role WHERE user.email = 'admin@example.com' AND role.alias = 'admin'"
    );
    const { id } = (await save(owner, { name: 'Show' })).json;

    assert.equal((await api('project?id=' + id, { token: other })).status, 403);
    assert.equal((await api('project?id=' + id, { token: admin })).status, 200);
  });

  it('opens no deleted project', async () => {
    const token = await user();
    const { id } = (await save(token, { name: 'Show' })).json;
    await api('project?id=' + id, { method: 'DELETE', token });

    const response = await api('project?id=' + id, { token });

    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'wrong-id' });
  });

  it('wants to know which project', async () => {
    const token = await user();

    const response = await api('project', { token });

    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'missing-parameters' });
    assert.deepEqual(phpErrors(), []);
  });
});

describe('deleting a project', () => {
  it('lets its manager delete a project, keeping it in the database', async () => {
    const token = await user();
    const { id } = (await save(token, { name: 'Show' })).json;

    const response = await api('project?' + query({ id, name: 'Show' }), {
      method: 'DELETE',
      token,
    });

    assert.equal(response.status, 200);
    assert.equal(sql('SELECT active FROM project WHERE id = ' + id)[0].active, '0');
  });

  it('keeps others from deleting a project', async () => {
    const owner = await user('owner@example.com');
    const other = await user('other@example.com');
    const { id } = (await save(owner, { name: 'Show' })).json;

    assert.equal((await api('project?id=' + id, { method: 'DELETE', token: other })).status, 401);
    assert.equal((await api('project?id=' + id, { method: 'DELETE' })).status, 401);
    assert.equal(sql('SELECT active FROM project WHERE id = ' + id)[0].active, '1');
  });

  it('wants to know which project', async () => {
    const token = await user();

    const response = await api('project', { method: 'DELETE', token });

    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'missing-parameters' });
    assert.deepEqual(phpErrors(), []);
  });
});

describe('the fixture library', () => {
  beforeEach(() => {
    sql(`INSERT INTO manufacturer(short_name, name, website) VALUES('stairville', 'Stairville', 'https://www.stairville.com'), ('cameo', 'Cameo', null);
      INSERT INTO fixture(uuid, name, manufacturer_short_name, main_category, object) VALUES
        ('stairville/mh-100', 'MH-100', 'stairville', 'Moving Head', '{"name":"MH-100","modes":[]}'),
        ('cameo/flat-par', 'Flat Par', 'cameo', 'Color Changer', '{"name":"Flat Par","modes":[]}'),
        ('stairville/led-par', 'LED Par', 'stairville', 'Color Changer', '{"name":"LED Par","modes":[]}')`);
  });

  it('lists the manufacturers', async () => {
    const response = await api('manufacturer');

    assert.deepEqual(
      response.json.sort((a, b) => a.shortName.localeCompare(b.shortName)),
      [
        { shortName: 'cameo', name: 'Cameo', website: null },
        {
          shortName: 'stairville',
          name: 'Stairville',
          website: 'https://www.stairville.com',
        },
      ]
    );
  });

  it('lists the fixtures by their manufacturer and name', async () => {
    const response = await api('fixtures');

    assert.deepEqual(
      response.json.map((fixture) => fixture.uuid),
      ['cameo/flat-par', 'stairville/led-par', 'stairville/mh-100']
    );
    assert.deepEqual(response.json[0], {
      uuid: 'cameo/flat-par',
      manufacturerName: 'Cameo',
      manufacturerShortName: 'cameo',
      name: 'Flat Par',
      mainCategory: 'Color Changer',
    });
  });

  it('searches the fixtures', async () => {
    const uuids = async (parameters) => (await api('fixtures?' + query(parameters))).json.map((fixture) => fixture.uuid);

    assert.deepEqual(await uuids({ uuid: 'stairville/mh-100' }), ['stairville/mh-100']);
    assert.deepEqual(await uuids({ manufacturerShortName: 'stair%' }), ['stairville/led-par', 'stairville/mh-100']);
    assert.deepEqual(await uuids({ name: '%par' }), ['cameo/flat-par', 'stairville/led-par']);
    assert.deepEqual(await uuids({ mainCategory: 'Moving Head' }), ['stairville/mh-100']);
    assert.deepEqual(await uuids({ name: '" OR "1" = "1' }), []);
  });

  it('hands out the profile of a fixture', async () => {
    const response = await api('fixture?' + query({ uuid: 'stairville/mh-100' }));

    assert.deepEqual(response.json, { name: 'MH-100', modes: [] });
  });

  it('hands out nothing for an unknown fixture', async () => {
    const response = await api('fixture?' + query({ uuid: 'unknown/fixture' }));

    assert.equal(response.status, 200);
    assert.equal(response.json, null);
    assert.deepEqual(phpErrors(), []);
  });
});

describe('the audio files of the compositions', () => {
  async function upload(parameters, name = 'Song.mp3', content = 'ID3 audio') {
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'audio/mpeg' }), name);

    return api('file/upload?' + query(parameters), {
      method: 'POST',
      body: form,
    });
  }

  it('stores an uploaded file named after its composition', async () => {
    const response = await upload({ compositionUuid: 'song-1', projectId: '' });

    assert.equal(response.status, 200);
    assert.deepEqual(sql('SELECT composition_uuid, project_id, name, size_bytes FROM composition_file'), [
      {
        composition_uuid: 'song-1',
        project_id: null,
        name: 'song-1.mp3',
        size_bytes: '9',
      },
    ]);
    assert.equal(readFileSync(join(root, 'composition-files', 'song-1.mp3'), 'utf8'), 'ID3 audio');
    assert.deepEqual(phpErrors(), []);
  });

  it('replaces the file of a composition', async () => {
    await upload({ compositionUuid: 'song-1' }, 'Song.mp3');
    await upload({ compositionUuid: 'song-1' }, 'Song.ogg', 'OggS');

    assert.deepEqual(sql('SELECT name FROM composition_file'), [{ name: 'song-1.ogg' }]);
    assert.equal(existsSync(join(root, 'composition-files', 'song-1.mp3')), false);
  });

  it('hands out the file of a composition', async () => {
    await upload({ compositionUuid: 'song-1' });

    const response = await api('composition-files/?file=song-1.mp3');

    assert.equal(response.status, 200);
    assert.equal(response.text, 'ID3 audio');
    assert.equal(response.headers.get('content-length'), '9');
  });

  it('hands out no other file of the server', async () => {
    for (const file of ['../database.php', '../global.php', 'song-1.php', 'missing.mp3', 'a.b.mp3', '']) {
      const response = await api('composition-files/?' + query({ file }));

      assert.equal(response.status, 404, file);
      assert.deepEqual(response.json, { error: 'no-file' });
    }
  });

  it('refuses a composition which can not name a file', async () => {
    for (const compositionUuid of ['../escape', 'a/b', 'with space', '']) {
      const response = await upload({ compositionUuid });

      assert.equal(response.status, 400, compositionUuid);
      assert.deepEqual(response.json, { error: 'wrong-parameters' });
    }

    const missing = await upload({});
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.json, { error: 'missing-parameters' });
  });

  it('takes audio files only', async () => {
    const response = await upload({ compositionUuid: 'song-1' }, 'script.php', '<?php echo 1;');

    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'format-not-allowed' });
    assert.equal(existsSync(join(root, 'composition-files', 'song-1.php')), false);
  });

  it('wants a file to store', async () => {
    const response = await api('file/upload?' + query({ compositionUuid: 'song-1' }), { method: 'POST' });

    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'missing-parameters' });
    assert.deepEqual(phpErrors(), []);
  });

  it('deletes the file of a composition', async () => {
    await upload({ compositionUuid: 'song-1' });

    const response = await api('file/delete?' + query({ compositionUuid: 'song-1' }), { method: 'POST' });

    assert.equal(response.status, 200);
    assert.deepEqual(sql('SELECT * FROM composition_file'), []);
    assert.equal(existsSync(join(root, 'composition-files', 'song-1.mp3')), false);

    const missing = await api('file/delete', { method: 'POST' });
    assert.equal(missing.status, 400);
  });
});

describe('the audio files of the compositions of a saved project', () => {
  async function upload(parameters, token, content = 'ID3 audio') {
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'audio/mpeg' }), 'Song.mp3');

    return api('file/upload?' + query(parameters), { method: 'POST', body: form, token });
  }

  // a saved project playing the composition of the passed uuid, with its audio file
  async function savedWithFile(token, compositionUuid) {
    await upload({ compositionUuid, projectId: '' });
    return (await save(token, { name: 'Show', compositions: [{ uuid: compositionUuid }] })).json.id;
  }

  const stored = () => readFileSync(join(root, 'composition-files', 'song.mp3'), 'utf8');

  it('keeps the file to the managers of the project', async () => {
    const owner = await user('owner@example.com');
    const other = await user('other@example.com');
    await savedWithFile(owner, 'song');

    for (const token of [undefined, other]) {
      assert.equal((await upload({ compositionUuid: 'song' }, token, 'replaced')).status, 401);
      assert.equal((await api('file/delete?' + query({ compositionUuid: 'song' }), { method: 'POST', token })).status, 401);
    }
    assert.equal(stored(), 'ID3 audio');

    assert.equal((await upload({ compositionUuid: 'song' }, owner, 'replaced')).status, 200);
    assert.equal(stored(), 'replaced');
    assert.equal((await api('file/delete?' + query({ compositionUuid: 'song' }), { method: 'POST', token: owner })).status, 200);
    assert.deepEqual(sql('SELECT * FROM composition_file'), []);
    assert.deepEqual(phpErrors(), []);
  });

  it('lets an admin change the file', async () => {
    const owner = await user('owner@example.com');
    const admin = await user('admin@example.com');
    sql(
      "INSERT INTO user_role(user_id, role_id) SELECT user.id, role.id FROM user, role WHERE user.email = 'admin@example.com' AND role.alias = 'admin'"
    );
    await savedWithFile(owner, 'song');

    assert.equal((await api('file/delete?' + query({ compositionUuid: 'song' }), { method: 'POST', token: admin })).status, 200);
  });

  it('takes a file for a saved project from its managers only', async () => {
    const owner = await user('owner@example.com');
    const other = await user('other@example.com');
    const id = (await save(owner, { name: 'Show' })).json.id;

    assert.equal((await upload({ compositionUuid: 'new-song', projectId: id }, other)).status, 401);
    assert.equal((await upload({ compositionUuid: 'new-song', projectId: id })).status, 401);
    assert.deepEqual(sql('SELECT * FROM composition_file'), []);

    assert.equal((await upload({ compositionUuid: 'new-song', projectId: id }, owner)).status, 200);
    assert.deepEqual(sql('SELECT project_id FROM composition_file'), [{ project_id: String(id) }]);
  });
});

describe('the API in the browser', () => {
  it('answers the requests of the designer from another origin', async () => {
    const response = await api('manufacturer', {
      headers: { Origin: 'https://designer.example.com' },
    });

    assert.equal(response.headers.get('access-control-allow-origin'), 'https://designer.example.com');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(response.headers.get('vary'), 'Origin');
  });

  it('allows the methods and headers the designer sends', async () => {
    const response = await api('project', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://designer.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization',
      },
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('access-control-allow-methods'), /DELETE/);
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
    assert.equal(response.text, '');
  });

  it('answers a failing query with the error of the API', async () => {
    sql('DROP TABLE fixture');

    const response = await api('fixtures');

    assert.equal(response.status, 500);
    assert.deepEqual(response.json, { error: 'internal' });
    // the cause is kept in the log of the server
    assert.match(readFileSync(errorLog, 'utf8'), /designer api fixtures\.php: .*fixture/);
  });
});

describe('upgrading an existing database', () => {
  it('gives every project a share token of its own', () => {
    sql(`UPDATE project SET share_token = 'template', object = '{"shareToken":"template-in-object"}' WHERE id = 1;
      INSERT INTO project(name, share_token, object) VALUES
        ('without', '', '{}'),
        ('from the template', 'template', '{}'),
        ('from the object of the template', 'template-in-object', '{}'),
        ('exported', 'shared', '{}'),
        ('imported', 'shared', '{}'),
        ('own', 'own', '{}')`);

    sql(readFileSync(join(here, '../database/upgrade-2026-10-26.sql'), 'utf8'));

    const tokens = Object.fromEntries(sql('SELECT name, share_token FROM project WHERE id <> 1').map((row) => [row.name, row.share_token]));
    assert.equal(tokens.own, 'own');
    assert.equal(tokens.exported, 'shared');
    for (const name of ['without', 'from the template', 'from the object of the template', 'imported']) {
      assert.match(tokens[name], /^[0-9a-f]{32}$/, name);
    }
    assert.equal(new Set(Object.values(tokens)).size, 6);
    assert.equal(sql('SELECT share_token FROM project WHERE id = 1')[0].share_token, 'template');
  });

  it('makes room for large projects and profiles', () => {
    sql(`ALTER TABLE project MODIFY object TEXT; ALTER TABLE fixture MODIFY object TEXT;`);

    sql(readFileSync(join(here, '../database/upgrade-2026-10-26.sql'), 'utf8'));

    const types = sql(
      "SELECT table_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'object' ORDER BY table_name"
    ).map((row) => [row.table_name ?? row.TABLE_NAME, row.data_type ?? row.DATA_TYPE]);
    assert.deepEqual(types, [
      ['fixture', 'mediumtext'],
      ['project', 'mediumtext'],
    ]);
  });
});
