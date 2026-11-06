import { expect, test } from './designer';

// The fixtures of a show are patched in the fixture pool: found in the library of profiles, added to the DMX universe
// one after another, named and removed again. OK takes them into the project, Cancel leaves it as it was.
test.describe('The fixture pool', () => {
  test.use({ previewHidden: true });
  test('adds fixtures of a profile found in the library', async ({ designer, api }) => {
    await designer.open();
    await designer.panel('Fixtures').getByRole('link', { name: 'Add new fixtures to the project' }).click();

    const pool = designer.fixturePool;
    await expect(pool.getByText('Test - Moving head')).toBeVisible();
    await expect(pool.getByText('Test - RGB par')).toBeVisible();

    await pool.getByPlaceholder('Search profiles').fill('rgb');
    await expect(pool.getByText('Test - Moving head')).toBeHidden();

    await designer.addFromLibrary('Test - RGB par');
    await designer.addFromLibrary('Test - RGB par');
    await expect(designer.names(pool)).toHaveText(['RGB par', 'RGB par']);

    // the one added last is selected: it starts where the six channels of the first one end
    await pool.getByRole('tab', { name: 'Settings' }).click();
    await expect(pool.getByRole('spinbutton')).toHaveValue('7');
    await pool.getByLabel('Fixture name').fill('Par right');
    await expect(designer.names(pool)).toHaveText(['RGB par', 'Par right']);

    await pool.getByRole('button', { name: 'OK' }).click();
    await expect(pool).toBeHidden();

    await expect(designer.names(designer.panel('Fixtures'))).toHaveText(['RGB par', 'Par right']);
    await expect(designer.editor.getByText('Select at least one fixture for this preset')).toBeVisible();

    // the profile has been fetched from the library once, for both fixtures
    expect(api.requestsTo('GET fixture')).toEqual([expect.objectContaining({ params: { uuid: 'test/rgb-par' } })]);
  });

  test('removes a fixture from the project', async ({ designer, api, page }) => {
    api.patchTemplate(
      { profile: 'test/rgb-par', name: 'Par left' },
      { profile: 'test/rgb-par', name: 'Par right' },
      { profile: 'test/moving-head', name: 'Spot' }
    );
    await designer.open();
    await expect(designer.names(designer.panel('Fixtures'))).toHaveText(['Par left', 'Par right', 'Spot']);

    // the key P opens the pool
    await page.keyboard.press('p');
    const pool = designer.fixturePool;
    await expect(designer.names(pool)).toHaveText(['Par left', 'Par right', 'Spot']);

    await designer.row(pool, 'Par right').getByRole('button', { name: 'Remove fixture' }).click();
    await expect(designer.names(pool)).toHaveText(['Par left', 'Spot']);

    await pool.getByRole('button', { name: 'OK' }).click();
    await expect(pool).toBeHidden();
    await expect(designer.names(designer.panel('Fixtures'))).toHaveText(['Par left', 'Spot']);
  });

  test('shows a fixture with pixels in one row, which lights all of them and opens to show them where they sit', async ({
    designer,
    api,
  }) => {
    api.addTestProfile('pixel-bar.json');
    await designer.open();
    await designer.panel('Fixtures').getByRole('link', { name: 'Add new fixtures to the project' }).click();

    const pool = designer.fixturePool;
    await designer.addFromLibrary('Test - Bar of three pixels');
    await pool.getByRole('button', { name: 'OK' }).click();
    await expect(pool).toBeHidden();

    // one row for the bar, not one for each of its pixels
    const fixtures = designer.panel('Fixtures');
    await expect(designer.names(fixtures)).toHaveText(['Bar of three pixels']);
    const bar = designer.row(fixtures, 'Bar of three pixels');
    await expect(bar).toContainText('3 px');

    await bar.getByRole('checkbox').check();
    await expect(designer.editor.getByText('Select at least one fixture for this preset')).toBeHidden();

    // opened, it shows the pixels where they sit, and a click takes a single one out of the preset
    await bar.locator('.tree-caret').click();
    const grid = fixtures.locator('lib-app-fixture-pixel-grid canvas');
    const box = await grid.boundingBox();
    await grid.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(bar.getByRole('checkbox')).toHaveJSProperty('indeterminate', true);

    // or one by one, to change the order they are chased in
    await bar.getByTitle('Pixels as rows, to change the order they are chased in').click();
    await expect(designer.names(fixtures)).toHaveText(['Bar of three pixels', '1', '2', '3']);
    await expect(designer.row(fixtures, '2').getByRole('checkbox')).not.toBeChecked();
    await expect(designer.row(fixtures, '1').getByRole('checkbox')).toBeChecked();

    await bar.locator('.tree-caret').click();
    await expect(designer.names(fixtures)).toHaveText(['Bar of three pixels']);
  });

  test('leaves the project as it was when the pool is cancelled', async ({ designer, page }) => {
    await designer.open();
    await designer.menu('Settings', 'Fixture pool');

    const pool = designer.fixturePool;
    await designer.addFromLibrary('Test - Moving head');
    await expect(designer.names(pool)).toHaveText(['Moving head']);

    await pool.getByRole('button', { name: 'Cancel' }).click();
    await expect(pool).toBeHidden();

    await expect(designer.names(designer.panel('Fixtures'))).toHaveCount(0);
    await expect(designer.panel('Fixtures').getByRole('link', { name: 'Add new fixtures to the project' })).toBeVisible();

    // and the pool opens without it again
    await page.keyboard.press('p');
    await expect(pool.getByText('Test - Moving head')).toBeVisible();
    await expect(designer.names(pool)).toHaveCount(0);
  });
});
