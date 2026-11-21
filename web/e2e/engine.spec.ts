import { expect, test } from './designer';

// The preview played by the shared lighting engine (engine.wasm), switched on with ?engine=shared: an edit reaches the
// preview, the DMX channels show the values the engine sends, and the engine agrees with the TypeScript engine within
// 1. engine.wasm is not in git (see engine/build.sh): without it this is skipped.
test.describe('The shared lighting engine', () => {
  test.beforeEach(async ({ api, request }) => {
    const engine = await request.get('/assets/engine/engine.wasm');
    test.skip(!engine.ok(), 'engine.wasm is not built (engine/build.sh)');
    api.patchTemplate({ profile: 'test/rgb-par', name: 'Par left' }, { profile: 'test/rgb-par', name: 'Par right' });
  });

  test('plays the preview and the DMX channels, and agrees with the TypeScript engine', async ({ designer, page }) => {
    await designer.open('/?engine=shared');

    // the switch is on and engine.wasm is there: the preview can be compared
    const compare = page.locator('a.preview-engine-button');
    await expect(compare).toBeVisible();

    const presets = designer.panel('Presets');
    await designer.clickTool(presets, 'fa-plus', 'Add preset');
    const fixtures = designer.panel('Fixtures');
    await designer.row(fixtures, 'Par left').getByRole('checkbox').check();
    await designer.row(fixtures, 'Par right').getByRole('checkbox').check();

    expect(await designer.previewLitIn('red')).toBeLessThan(0.001);
    await designer.dimmerField.fill('100');
    await designer.pickHue(0);

    // the edit compiled the project again, and the engine lights the pars red
    await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.01);

    // the DMX channels: the values the engine sends
    await designer.menu('Settings', 'DMX channels');
    const dmx = designer.dialog('DMX channels');
    const par = dmx.locator('.dmx-group').filter({ hasText: 'Par left' });
    await expect(par.locator('.dmx-strip').first().locator('.dmx-value')).toHaveText('255');
    await dmx.getByRole('button', { name: 'OK' }).click();
    await expect(dmx).toBeHidden();

    await compare.click();
    await expect(page.locator('.toast-success')).toContainText('agree within 1');
  });
});
