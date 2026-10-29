import { expect, test } from './designer';

// The panels are folded with the arrows in the gutters next to them, or in the View menu, which also has the layouts
// for the ways of working on a show. The browser keeps the layout, also through a reload.
test.describe('The layout', () => {
  test.use({ previewHidden: true });

  test('folds a panel with the arrow in a gutter and keeps it folded after a reload', async ({ designer, page }) => {
    await designer.open();

    await page.getByRole('button', { name: 'Fold: Scenes', exact: true }).click();
    await expect(designer.panel('Scenes')).toBeHidden();
    await expect(designer.panel('Presets')).toBeVisible();

    await designer.reload();
    await expect(designer.panel('Scenes')).toBeHidden();
    await expect(designer.panel('Presets')).toBeVisible();

    // it left an arrow at the edge of its row, to open it again
    await page.getByRole('button', { name: 'Open: Scenes', exact: true }).click();
    await expect(designer.panel('Scenes')).toBeVisible();
    await expect(designer.names(designer.panel('Scenes'))).toHaveText(['New Scene', 'New Preset']);

    await designer.reload();
    await expect(designer.panel('Scenes')).toBeVisible();
  });

  test('folds a whole row with the arrow between the rows', async ({ designer, page }) => {
    await designer.open();

    await page.getByRole('button', { name: 'Fold: Preset editor, Fixtures, Master dimmer', exact: true }).first().click();
    await expect(designer.panel('Fixtures')).toBeHidden();
    await expect(designer.editor).toBeHidden();
    await expect(designer.masterDimmer).toBeHidden();
    await expect(designer.panel('Scenes')).toBeVisible();

    await page.getByRole('button', { name: 'Open: Preset editor, Fixtures, Master dimmer', exact: true }).click();
    await expect(designer.panel('Fixtures')).toBeVisible();
    await expect(designer.masterDimmer).toBeVisible();
  });

  test('picks the layouts of the View menu', async ({ designer }) => {
    await designer.open();
    const timeline = designer.timeline;

    // watching the show: the scenes and a big preview, played from the toolbar of the timeline
    await designer.menu('View', 'Stage');
    await expect(designer.panel('Scenes')).toBeVisible();
    await expect(designer.previewPanel).toBeVisible();
    for (const folded of [designer.panel('Presets'), designer.panel('Fixtures'), designer.editor, designer.masterDimmer]) {
      await expect(folded).toBeHidden();
    }
    await expect(timeline.getByRole('link', { name: 'Create a composition to synchronize the scenes' })).toBeHidden();
    await expect(designer.tool(timeline, 'fa-plus-circle')).toBeVisible();

    // putting the scenes on the timeline: the presets fold away
    await designer.menu('View', 'Show');
    await expect(designer.panel('Scenes')).toBeVisible();
    await expect(designer.panel('Presets')).toBeHidden();
    await expect(timeline.getByRole('link', { name: 'Create a composition to synchronize the scenes' })).toBeVisible();

    await designer.reload();
    await expect(designer.panel('Presets')).toBeHidden();

    await designer.menu('View', 'Default');
    for (const open of [
      designer.panel('Scenes'),
      designer.panel('Presets'),
      designer.panel('Fixtures'),
      designer.editor,
      designer.masterDimmer,
    ]) {
      await expect(open).toBeVisible();
    }
  });

  test('folds and opens a single panel in the View menu', async ({ designer }) => {
    await designer.open();
    const createComposition = designer.timeline.getByRole('link', { name: 'Create a composition to synchronize the scenes' });

    // the timeline folds down to its toolbar
    await designer.menu('View', 'Timeline');
    await expect(createComposition).toBeHidden();
    await expect(designer.page.getByRole('button', { name: 'Open: Timeline', exact: true })).toBeVisible();

    await designer.menu('View', 'Timeline');
    await expect(createComposition).toBeVisible();
  });
});
