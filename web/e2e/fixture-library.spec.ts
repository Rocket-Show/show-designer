import { readFileSync } from 'fs';
import { join } from 'path';
import { expect, test } from './designer';

// The profiles of the library are versions of their fixtures: the fixture pool tells where a version comes from and
// what is known about it, marks a fixture for which the library has a better version than the copy the project plays
// from, lets the user vote on the mode in use, and has the AI make a profile from the manual of a fixture.
test.describe('The fixture library', () => {
  test.use({ previewHidden: true, signedIn: true });

  // the 6 channels of the RGB par, as the library has them in each of its versions
  const modeStates = (hash: string, state = 'open') => [{ shortName: '6ch', name: '6-channel', hash, state, good: 0, bad: 0 }];

  test('marks a fixture for which the library has a better version, changes it to that one and votes on it', async ({ designer, api }) => {
    // the project plays from the version of the Open Fixture Library, the best one is one of the AI doing the mode
    // differently
    api.addVersion('rgb-par.json', 1, { origin: 'ofl', state: 'open', usage: 9, versions: 2, best: false, modeStates: modeStates('a') });
    api.addVersion('rgb-par.json', 2, { origin: 'ai', state: 'open', usage: 2, versions: 2, best: true, modeStates: modeStates('b') });
    api.patchTemplate({ profile: 'test/rgb-par~1', name: 'Par left' }, { profile: 'test/rgb-par~1', name: 'Par right' });
    await designer.open();

    // the library is asked about the versions of the copy as the project opens
    await expect.poll(() => api.requestsTo('GET fixtures').some((request) => request.params.fixture === 'test/rgb-par~1')).toBe(true);

    await designer.menu('Settings', 'Fixture pool');
    const pool = designer.fixturePool;

    // the search lists the best version of each fixture, with where it comes from and what is known about it
    const searchRow = pool.locator('.list-group-item').filter({ hasText: 'Test - RGB par' });
    await expect(searchRow).toHaveCount(1);
    await expect(searchRow).toContainText('AI-generated');
    await expect(searchRow).toContainText('not confirmed yet');
    await expect(searchRow).toContainText('2 versions');

    // the versions of the fixture open in front of the fixture pool, and can be clicked
    await searchRow.getByText('2 versions').click();
    const versions = designer.page.locator('.fixture-library-popover');
    await expect(versions).toBeVisible();
    await expect(versions.getByRole('button').first()).toBeVisible();
    await versions.getByRole('button').first().click({ trial: true });
    await designer.page.keyboard.press('Escape');
    await searchRow.click({ position: { x: 5, y: 5 } });

    const better = 'There is a better version, which does this mode differently.';
    await designer.row(pool, 'Par right').getByRole('button', { name: better }).click();
    await expect(designer.row(pool, 'Par right').getByRole('button', { name: better })).toBeHidden();
    await expect(designer.row(pool, 'Par left').getByRole('button', { name: better })).toBeVisible();

    // the fixture changed to the best version, which tells what is carried over
    await pool.getByRole('tab', { name: 'Settings' }).click();
    await expect(pool.getByText('Changed from Test - RGB par')).toBeVisible();
    await expect(pool.locator('.fixture-type-library')).toContainText('AI-generated');

    // the user marks the mode good, counted at once
    await expect(pool.getByText('Does this mode work with your fixture?')).toBeVisible();
    await pool.getByTitle('It works').click();
    await expect(pool.getByTitle('It works')).toHaveText('1');
    expect(api.requestsTo('POST fixture-vote')[0].body).toEqual({ uuid: 'test/rgb-par~2', mode: '6ch', good: true });

    await pool.getByRole('button', { name: 'OK' }).click();
    await expect(pool).toBeHidden();
  });

  test('creates a profile with the AI from a manual, reviewed before it goes into the project', async ({ designer, api, page }) => {
    const profile = JSON.parse(readFileSync(join(__dirname, '../projects/designer/conformance/profiles/test/moving-head.json'), 'utf8'));
    const channels = Object.keys(profile.availableChannels);
    api.aiFixture = {
      version: { uuid: 'test/spot-1~1', fixture: 'test/spot-1', manufacturerName: 'Test', name: 'Spot 1', origin: 'ai', state: 'open' },
      profile: { ...profile, name: 'Spot 1' },
      review: {
        channels: { [channels[0]]: { page: 12, quote: 'CH1 Pan 0-540°', verified: false, uncertain: null } },
        uncertain: ['The manual names two tilt ranges.'],
      },
    };
    await designer.open();
    await designer.menu('Settings', 'Fixture pool');
    const pool = designer.fixturePool;

    await pool.getByRole('button', { name: 'Create profile with AI' }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Create profile with AI' }) });
    await expect(dialog.getByText('20 of 20 profiles left today')).toBeVisible();

    await dialog.getByLabel('Manufacturer').selectOption({ label: 'Test' });
    await dialog.getByLabel('Model').fill('Spot 1');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'spot.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });

    // the library is looked into first, by the manual as well
    await dialog.getByRole('button', { name: 'Look up' }).click();
    await expect(dialog.getByText('The library has no profile of this fixture yet.')).toBeVisible();
    const [lookup] = api.requestsTo('POST ai-fixtures');
    expect(lookup.form).toEqual({
      action: 'lookup',
      manufacturerShortName: 'test',
      model: 'Spot 1',
      manualSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    // the AI makes it, and the user reviews it against the manual
    await dialog.getByRole('button', { name: 'Create with AI' }).click();
    await expect(dialog.getByText('The manual names two tilt ranges.')).toBeVisible();
    // (the fine channel of pan is read where pan is)
    await expect(dialog.getByRole('row').filter({ hasText: 'Pan fine' })).toContainText('CH1 Pan 0-540°');
    await expect(dialog.getByText('not verified').first()).toBeVisible();

    const generate = api.requestsTo('POST ai-fixtures')[1];
    expect(generate.form).toEqual({ action: 'generate', manufacturerShortName: 'test', model: 'Spot 1', manual: 'spot.pdf' });

    await dialog.getByRole('button', { name: 'Add to the project' }).click();
    await expect(dialog).toBeHidden();
    await expect(designer.names(pool)).toHaveText(['Spot 1']);

    await pool.getByRole('button', { name: 'OK' }).click();
    await expect(designer.names(designer.panel('Fixtures'))).toHaveText(['Spot 1']);
  });
});
