import { expect, test } from './designer';

// A pixel effect paints a pattern over the pixels of the bars and matrices of a preset, in the colors of a palette. It is
// added among the effects of the preset, and its card shows the pixels of the preset as the effect lights them.
test.describe('Pixel effects', () => {
  test.use({ previewHidden: true });

  test('adds a pixel effect to a preset lighting a bar, picks its pattern and its palette, and shows the bar lit in it', async ({
    designer,
    api,
    page,
  }) => {
    api.addTestProfile('pixel-bar.json');
    await designer.open();
    await designer.panel('Fixtures').getByRole('link', { name: 'Add new fixtures to the project' }).click();
    await designer.addFromLibrary('Test - Bar of three pixels');
    await designer.fixturePool.getByRole('button', { name: 'OK' }).click();
    await expect(designer.fixturePool).toBeHidden();
    await designer.row(designer.panel('Fixtures'), 'Bar of three pixels').getByRole('checkbox').check();

    // among the effects of the preset
    await page.locator('#v-pills-effects-tab').click();
    await page.getByText('Add new Effect').click();
    await page.locator('.dropdown-menu.show').getByText('Pixel effect').click();
    await expect(page.locator('lib-app-effect accordion-group').getByText('Pixel effect')).toBeVisible();

    // a chase in the colors of the rainbow, made a flow in the colors of fire
    const card = page.locator('lib-app-effect-curve');
    await expect(card.locator('select[name="pattern"]')).toHaveValue('chase');
    await expect(card.getByLabel('Rainbow')).toBeChecked();
    await card.locator('select[name="pattern"]').selectOption('flow');
    await card.getByLabel('Fire').check();
    await expect(card.getByText('Length')).toBeVisible();

    // the grid shows the three pixels of the bar in the colors of fire: red, orange and yellow, hardly any blue
    await expect
      .poll(() =>
        card.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let red = 0;
          let blue = 0;

          for (let i = 0; i < data.length; i += 4) {
            red += data[i];
            blue += data[i + 2];
          }

          return red > blue * 2;
        })
      )
      .toBe(true);
  });
});
