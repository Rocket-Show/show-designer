import { expect, test } from './designer';

// A phone has no room to split the panels side by side: they are stacked down the page, which scrolls. All of them are
// there but the 3D preview, so that a show can be edited on a phone as well.
test.describe('On a phone', () => {
  test.use({ previewHidden: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ api }) => {
    api.patchTemplate({ profile: 'test/rgb-par', name: 'Par left' }, { profile: 'test/rgb-par', name: 'Par right' });
  });

  test('stacks all the panels but the 3D preview down the page, with all the menus', async ({ designer, page }) => {
    await designer.open();

    // from the top: the scenes, the presets, the fixtures picked for the preset, the editor, the master dimmer and the
    // timeline
    const stacked = [
      designer.panel('Scenes'),
      designer.panel('Presets'),
      designer.panel('Fixtures'),
      designer.editor,
      designer.masterDimmer,
      designer.timeline,
    ];
    const tops: number[] = [];
    for (const panel of stacked) {
      await expect(panel).toBeVisible();
      tops.push((await panel.boundingBox()).y);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    await expect(designer.previewPanel).toBeHidden();

    // nothing sticks out to the side
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const navigation = page.getByRole('navigation');
    for (const menu of ['Project', 'Edit', 'View', 'Settings', 'Help']) {
      await expect(navigation.getByRole('link', { name: menu, exact: true })).toBeVisible();
    }
    await expect(navigation.getByText('Share', { exact: true })).toBeVisible();
    await expect(designer.projectName).toBeVisible();
  });

  test('edits a preset of a scene and puts the scene on the timeline', async ({ designer, page }) => {
    await designer.open();
    const scenes = designer.panel('Scenes');
    const presets = designer.panel('Presets');

    await designer.clickTool(scenes, 'fa-plus');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Scene', 'New Preset']);
    await designer.row(scenes, 'New Scene').first().getByRole('button', { name: '...' }).click();
    await expect(designer.dialog('Name')).toBeVisible();
    await designer.dialog('Name').getByRole('button', { name: 'Cancel' }).click();

    await designer.clickTool(presets, 'fa-plus');
    await expect(designer.names(presets)).toHaveText(['New Preset', 'New Preset']);

    const fixtures = designer.panel('Fixtures');
    await designer.row(fixtures, 'Par left').getByRole('checkbox').check();
    await designer.dimmerField.fill('50');
    await expect(designer.dimmerCheckbox).toBeChecked();
    // the editor is further down the page
    await page.locator('#color-picker-container').scrollIntoViewIfNeeded();
    await designer.pickHue(240);
    await expect(designer.editTarget).toHaveText('New Preset');

    await page.getByRole('link', { name: 'Create a composition to synchronize the scenes' }).click();
    const settings = designer.dialog('Synchronization');
    await settings.getByRole('textbox').first().fill('Opener');
    await settings.getByRole('combobox').selectOption({ label: 'None' });
    await settings.getByRole('button', { name: 'OK' }).click();
    await expect(settings).toBeHidden();
    await expect(designer.timeline.getByText('Add track')).toBeVisible();
  });

  test('folds the panels in the View menu, which has no 3D preview to open', async ({ designer, page }) => {
    await designer.open();

    await page.getByRole('navigation').getByRole('link', { name: 'View', exact: true }).click();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Fixtures', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: '3D preview', exact: true })).toBeHidden();

    await page.getByRole('navigation').getByRole('link', { name: 'Fixtures', exact: true }).click();
    await expect(designer.panel('Fixtures')).toBeHidden();
    await expect(designer.panel('Presets')).toBeVisible();
    await expect(designer.editor).toBeVisible();

    // the layout for watching the show leaves the scenes and the toolbar of the timeline
    await designer.menu('View', 'Stage');
    await expect(designer.panel('Scenes')).toBeVisible();
    await expect(designer.panel('Presets')).toBeHidden();
    await expect(designer.previewPanel).toBeHidden();
    await expect(designer.tool(designer.timeline, 'fa-plus-circle')).toBeVisible();
  });
});

// The introduction walks a new user on a phone through the panels as well, from the bottom of the screen
test.describe('The introduction on a phone', () => {
  test.use({ introSeen: false, previewHidden: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('leaves out the 3D preview and brings the panel of each step into view', async ({ designer, page }) => {
    await designer.open();
    await expect(designer.intro.getByText('Quick introduction')).toBeVisible();

    await designer.intro.getByRole('button', { name: 'Continue' }).click();
    await expect(designer.intro.getByText('Fixtures', { exact: true })).toBeVisible();
    await expect(designer.panel('Fixtures')).toHaveClass(/card-intro-active/);
    await expect(designer.panel('Fixtures')).toBeInViewport();

    // all of it fits on the screen
    const intro = await designer.intro.locator('.card').boundingBox();
    expect(intro.x).toBeGreaterThanOrEqual(0);
    expect(intro.x + intro.width).toBeLessThanOrEqual(390);
    expect(intro.y + intro.height).toBeLessThanOrEqual(844);
  });
});
