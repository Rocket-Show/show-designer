import { expect, test } from './designer';

// Fans and gradients: a value of a step (the dimmer, a color) is fanned out over the fixtures of the preset, each
// fixture taking its own value by its place in the fan, and a gradient of colors is spanned over them. The preview lights
// each fixture in its own color.
test.describe('Fans', () => {
  test.beforeEach(async ({ api }) => {
    api.patchTemplate(
      { profile: 'test/rgb-par', name: 'Par 1' },
      { profile: 'test/rgb-par', name: 'Par 2' },
      { profile: 'test/rgb-par', name: 'Par 3' },
      { profile: 'test/rgb-par', name: 'Par 4' }
    );
  });

  test('fans the dimmer out over the fixtures and spans a gradient of colors over them', async ({ designer, page }) => {
    await designer.open();
    const fixtures = designer.panel('Fixtures');

    for (const name of ['Par 1', 'Par 2', 'Par 3', 'Par 4']) {
      await designer.row(fixtures, name).getByRole('checkbox').check();
    }

    await designer.dimmerField.fill('100');

    // a gradient from red to blue: the preview shows both
    const color = page.locator('lib-app-fixture-capability-color');
    await color.getByRole('button', { name: 'Gradient' }).click();
    await expect(color.locator('lib-app-gradient-editor')).toBeVisible();
    await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.001);
    await expect.poll(() => designer.previewLitIn('blue')).toBeGreaterThan(0.001);

    // the gradient in steps: each par in one of the colors, still both of them
    await color.getByRole('button', { name: 'Steps' }).click();
    await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.001);
    await expect.poll(() => designer.previewLitIn('blue')).toBeGreaterThan(0.001);

    // one color for all of them again: no gradient editor anymore
    await color.getByRole('button', { name: 'Gradient' }).click();
    await expect(color.locator('lib-app-gradient-editor')).toHaveCount(0);

    // the dimmer from 20 % on the first par to full on the last one, a bar for each par
    const dimmer = page.locator('lib-app-fixture-capability-dimmer');
    await dimmer.getByRole('button', { name: 'Fan out' }).click();
    await expect(dimmer.locator('input[name="fan-from"]')).toHaveValue('0');
    await dimmer.locator('input[name="fan-from"]').fill('20');
    await expect(dimmer.locator('input[name="fan-to"]')).toHaveValue('100');
    await expect(dimmer.locator('.fan-bar')).toHaveCount(4);
  });
});
