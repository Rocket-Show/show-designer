import { expect, test } from './designer';

// The DMX channels show the value sent on every channel of a universe and hold a channel at the value of its fader,
// over what the presets put on it, until the fader is let go or the page is closed.
test.describe('DMX channels', () => {
  test.beforeEach(async ({ api }) => {
    api.patchTemplate({ profile: 'test/rgb-par', name: 'Par left' }, { profile: 'test/moving-head', name: 'Spot' });
  });

  test('shows the channels of the fixtures and lights them with the faders until the page is closed', async ({ designer, page }) => {
    await designer.open();
    await designer.menu('Settings', 'DMX channels');
    const dmx = designer.dialog('DMX channels');
    await expect(dmx).toBeVisible();

    // a group of channels for each fixture, named after it
    const groups = dmx.locator('.dmx-group-label');
    await expect(groups).toHaveText(['Par left', 'Spot']);
    const par = dmx.locator('.dmx-group').filter({ hasText: 'Par left' });
    await expect(par.locator('.dmx-name')).toContainText(['Dimmer', 'Red', 'Green', 'Blue']);

    expect(await designer.previewLitIn('red')).toBeLessThan(0.001);

    // the dimmer and the red of the par held at full light it red in the preview
    for (const name of ['Dimmer', 'Red']) {
      const fader = par
        .locator('.dmx-strip')
        .filter({ has: page.locator('.dmx-name', { hasText: new RegExp(`^${name}$`) }) })
        .locator('.dmx-fader');
      await fader.evaluate((input: HTMLInputElement) => {
        input.value = '255';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    await expect(par.locator('.dmx-strip-held .dmx-value')).toHaveText(['255', '255']);
    await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.001);

    // closing the page lets go of the faders: the par is dark again
    await dmx.getByRole('button', { name: 'OK' }).click();
    await expect(dmx).toBeHidden();
    await expect.poll(() => designer.previewLitIn('red')).toBeLessThan(0.001);
  });
});
