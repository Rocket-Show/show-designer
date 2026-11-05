import { Locator, Page } from '@playwright/test';
import { expect, test } from './designer';

// a picture of 4 by 4 pixels, red and blue like a chessboard
const CHECKER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVR4nGP4zwAE/yEkgvUfysUqAwCeow/x34oU2QAAAABJRU5ErkJggg==';

// how much red, green and blue the grid of the card shows, added up over its pixels
function colorsOfGrid(card: Locator): Promise<number[]> {
  return card.locator('canvas.curve-grid').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const sums = [0, 0, 0];

    for (let i = 0; i < data.length; i += 4) {
      sums[0] += data[i];
      sums[1] += data[i + 1];
      sums[2] += data[i + 2];
    }

    return sums;
  });
}

// a pixel effect in the preset, which lights the fixture of a test profile added to the project
async function addPixelEffect(designer: any, api: any, page: Page, file: string, name: string): Promise<Locator> {
  api.addTestProfile(file);
  await designer.open();
  await designer.panel('Fixtures').getByRole('link', { name: 'Add new fixtures to the project' }).click();
  await designer.addFromLibrary('Test - ' + name);
  await designer.fixturePool.getByRole('button', { name: 'OK' }).click();
  await expect(designer.fixturePool).toBeHidden();
  await designer.row(designer.panel('Fixtures'), name).getByRole('checkbox').check();

  await page.locator('#v-pills-effects-tab').click();
  await page.getByText('Add new Effect').click();
  await page.locator('.dropdown-menu.show').getByText('Pixel effect').click();

  return page.locator('lib-app-effect-curve');
}

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

  test('picks a pattern among moving tiles, and saves the colors it is painted in with the project', async ({ designer, api, page }) => {
    const card = await addPixelEffect(designer, api, page, 'pixel-matrix.json', 'Matrix of 4 x 3 pixels');

    // the tiles show each pattern before it is picked, and close again with the pick
    await card.locator('.pixel-picker-toggle').click();
    await expect(card.locator('.pixel-picker-tile')).not.toHaveCount(0);
    await card.locator('.pixel-picker-tile', { hasText: 'Plasma' }).first().click();
    await expect(card.locator('.pixel-picker')).toBeHidden();
    await expect(card.locator('select[name="pattern"]')).toHaveValue('plasma');

    // the colors of fire, the first one made green, typed after a look at the color picker
    await card.getByLabel('Fire').check();
    const stops = card.locator('.gradient-stop');
    await expect(stops).toHaveCount(6);
    await card.locator('.gradient-swatch').click();
    await expect(card.locator('lib-app-color-picker')).toBeVisible();
    await card.locator('input[name="gradientColor"]').fill('#00ff00');
    await expect(card.getByLabel('Fire')).not.toBeChecked();

    // one more color where the bar is clicked, the last one dragged down off the bar
    const bar = await card.locator('.gradient-bar').boundingBox();
    await page.mouse.click(bar.x + bar.width * 0.1, bar.y + bar.height / 2);
    await expect(stops).toHaveCount(7);
    const last = await stops.nth(5).boundingBox();
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + 80, { steps: 4 });
    await page.mouse.up();
    await expect(stops).toHaveCount(6);

    // saved under a name of its own
    await card.locator('input[name="paletteName"]').fill('Toxic');
    await card.getByText('Save in the project').click();
    await expect(card.getByLabel('Toxic')).toBeChecked();

    // painted in green now
    await expect.poll(async () => (await colorsOfGrid(card))[1]).toBeGreaterThan(0);

    // another effect can be painted in it as well, until it is deleted
    await card.getByLabel('Rainbow').check();
    await card.getByLabel('Toxic').check();
    await expect(stops.first()).toHaveAttribute('aria-label', /#00ff00/);
    await card.locator('.pixel-project-palette .pixel-palette-delete').click();
    await expect(card.getByLabel('Toxic')).toHaveCount(0);
  });

  test('writes a text over the pixels, and shows an image picked on them in its own colors', async ({ designer, api, page }) => {
    const card = await addPixelEffect(designer, api, page, 'pixel-matrix.json', 'Matrix of 4 x 3 pixels');

    await card.locator('select[name="pattern"]').selectOption('text');
    await card.locator('input[name="pixelText"]').fill('HI');
    await expect.poll(async () => (await colorsOfGrid(card)).reduce((sum, color) => sum + color, 0)).toBeGreaterThan(0);

    // the picture becomes pixels of the effect, red and blue
    await card.locator('select[name="pattern"]').selectOption('image');
    await card.locator('input[name="pixelImage"]').setInputFiles({
      name: 'checker.png',
      mimeType: 'image/png',
      buffer: Buffer.from(CHECKER_PNG, 'base64'),
    });
    await expect(card.locator('.pixel-image-pick')).toContainText('checker.png');
    await expect
      .poll(async () => {
        const [red, green, blue] = await colorsOfGrid(card);

        return red > green * 4 && blue > green * 4;
      })
      .toBe(true);
  });

  test('follows the audio with a level meter, a beat while no composition plays', async ({ designer, api, page }) => {
    const card = await addPixelEffect(designer, api, page, 'pixel-bar.json', 'Bar of three pixels');

    await card.locator('select[name="pattern"]').selectOption('meter');
    await card.getByRole('tab', { name: 'Audio' }).click();
    await card.getByLabel('Follows the audio of the composition').check();
    await card.locator('select[name="audioBand"]').selectOption('bass');

    // the bar goes up and down with the kick
    const brightness = async () => (await colorsOfGrid(card)).reduce((sum, color) => sum + color, 0);
    const seen = new Set<number>();

    await expect
      .poll(async () => {
        seen.add(await brightness());

        return seen.size;
      })
      .toBeGreaterThan(2);
  });
});
