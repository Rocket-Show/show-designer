import { expect, test } from './designer';

// An edit of the project is undone and redone with ctrl+z and ctrl+y (or ctrl+shift+z), or in the Edit menu. An undo
// puts back the project as it was before the edit, also an edit made in a dialog.
test.describe('Undo and redo', () => {
  test.use({ previewHidden: true });

  test('undoes and redoes adding a scene with the keyboard', async ({ designer, page }) => {
    await designer.open();
    const scenes = designer.panel('Scenes');

    await designer.clickTool(scenes, 'fa-plus', 'Add scene');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Scene', 'New Preset']);

    await page.keyboard.press('Control+z');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Preset']);

    await page.keyboard.press('Control+y');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Scene', 'New Preset']);

    await page.keyboard.press('Control+z');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Preset']);
    await page.keyboard.press('Control+Shift+z');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Scene', 'New Preset']);
  });

  test('undoes and redoes a value typed in, from the Edit menu', async ({ designer, page }) => {
    await designer.open();
    const navigation = page.getByRole('navigation');

    // nothing has been changed yet
    await navigation.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(navigation.getByRole('link', { name: 'Undo' })).toHaveClass(/disabled/);
    await expect(navigation.getByRole('link', { name: 'Redo' })).toHaveClass(/disabled/);
    await page.keyboard.press('Escape');

    await designer.masterDimmer.fill('40');

    await designer.menu('Edit', 'Undo');
    await expect(designer.masterDimmer).toHaveValue('100');

    await navigation.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(navigation.getByRole('link', { name: 'Undo' })).toHaveClass(/disabled/);
    await navigation.getByRole('link', { name: 'Redo' }).click();
    await expect(designer.masterDimmer).toHaveValue('40');
  });

  test('undoes the fixtures added in the fixture pool, one edit after the other', async ({ designer, page }) => {
    await designer.open();
    const fixtures = designer.panel('Fixtures');

    await page.keyboard.press('p');
    await designer.addFromLibrary('Test - RGB par');
    await designer.fixturePool.getByRole('button', { name: 'OK' }).click();
    await expect(designer.names(fixtures)).toHaveText(['RGB par']);

    await designer.row(fixtures, 'RGB par').getByRole('checkbox').check();
    await expect(designer.colorCheckbox).toBeVisible();

    // the fixture is taken out of the preset first, then out of the project
    await page.keyboard.press('Control+z');
    await expect(designer.row(fixtures, 'RGB par').getByRole('checkbox')).not.toBeChecked();
    await expect(designer.editor.getByText('Select at least one fixture for this preset')).toBeVisible();

    await page.keyboard.press('Control+z');
    await expect(designer.names(fixtures)).toHaveCount(0);
    await expect(designer.editor.getByText('Add new fixtures to the project')).toBeVisible();

    await page.keyboard.press('Control+y');
    await expect(designer.names(fixtures)).toHaveText(['RGB par']);
  });
});
