import { expect, test } from './designer';

// A new visitor gets the template project with all the panels of the designer, and the intro walks them through it.
test.describe('Starting the designer', () => {
  test('opens the template project with all its panels', async ({ designer, api, page }) => {
    await designer.open();

    // the template is the project with id 1, read without being signed in
    expect(api.requestsTo('GET project')).toEqual([
      expect.objectContaining({ params: { id: '1', name: '', token: '' }, authorization: undefined }),
    ]);

    const scenes = designer.panel('Scenes');
    const presets = designer.panel('Presets');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Preset']);
    await expect(designer.names(presets)).toHaveText(['New Preset']);

    // the 3D preview draws the stage with WebGL
    await expect(designer.preview).toBeVisible();
    expect(await designer.preview.evaluate((canvas: HTMLCanvasElement) => !!canvas.getContext('webgl2'))).toBe(true);
    // playing the selected scene
    await expect(designer.previewPanel.getByText('Scene', { exact: true })).toBeVisible();
    await expect(designer.previewPanel.getByText('New Scene', { exact: true })).toBeVisible();

    // the editor of the selected preset and the fixtures wait for the first fixtures
    await expect(designer.editor.getByText('Add new fixtures to the project')).toBeVisible();
    await expect(designer.panel('Fixtures').getByRole('link', { name: 'Add new fixtures to the project' })).toBeVisible();

    await expect(designer.masterDimmer).toHaveValue('100');
    await expect(page.getByText('Create a composition to synchronize the scenes')).toBeVisible();

    // each panel can be folded with the arrows in the gutters next to it
    for (const panel of ['Scenes', 'Presets', '3D preview', 'Preset editor', 'Fixtures', 'Master dimmer', 'Timeline']) {
      await expect(page.getByRole('button', { name: 'Fold: ' + panel, exact: true }).first()).toBeVisible();
    }

    // nobody is signed in yet, and the project has no name
    await expect(page.getByRole('navigation').getByText('Sign in')).toBeVisible();
    await expect(page.getByRole('navigation').getByText('Name', { exact: true })).toBeVisible();
  });
});

// The quick introduction for a new user: it goes through the panels step by step, and once closed it stays closed.
test.describe('The intro', () => {
  test.use({ introSeen: false, previewHidden: true });

  const steps = [
    'Quick introduction',
    'Preview',
    'Fixtures',
    'Presets',
    'Capabilities, channels and effects',
    'Scenes',
    'Timeline',
    'Well done!',
  ];

  test('walks a new user through the panels, forth and back', async ({ designer, page }) => {
    await designer.open();
    const intro = designer.intro;

    await expect(intro).toContainText('This two-minute-introduction will teach you the most basic functionalities');
    await expect(intro.getByRole('button', { name: 'Back' })).toBeHidden();

    for (const step of steps.slice(1)) {
      await intro.getByRole('button', { name: 'Continue' }).click();
      await expect(intro.getByText(step, { exact: true })).toBeVisible();
    }

    await expect(intro).toContainText("About time you're gonna try it out by yourself!");
    await expect(intro.getByRole('button', { name: 'Continue' })).toBeHidden();

    await intro.getByRole('button', { name: 'Back' }).click();
    await expect(intro.getByText('Timeline', { exact: true })).toBeVisible();
    await intro.getByRole('button', { name: 'Continue' }).click();

    await intro.getByText('Close', { exact: true }).click();
    await expect(intro.getByText('Well done!')).toBeHidden();

    await designer.reload();
    await expect(page.getByText('Quick introduction')).toBeHidden();
  });

  test('stays closed after a reload once it is closed, until it is asked for in the help', async ({ designer, page }) => {
    await designer.open();
    const intro = designer.intro;

    // the cross at the top right skips it
    await intro.getByRole('button', { name: 'Close' }).click();
    await expect(intro.getByText('Quick introduction')).toBeHidden();

    await designer.reload();
    await expect(page.getByText('Quick introduction')).toBeHidden();

    await designer.menu('Help', 'Show intro');
    await expect(intro.getByText('Quick introduction')).toBeVisible();
    await expect(intro.getByRole('button', { name: 'Continue' })).toBeVisible();

    // and is shown again on the next visit, as long as it isn't closed
    await designer.reload();
    await expect(page.getByText('Quick introduction')).toBeVisible();
  });
});
