import { expect, test } from './designer';

// the hex code of a color as the browser reports it in a style, e.g. #ff0808 -> rgb(255, 8, 8)
function rgb(hex: string): string {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${red}, ${green}, ${blue})`;
}

// A preset gives a group of fixtures a look: the fixtures are selected for it, the editor sets what they do (a dimmer
// value, a color), and the preset is marked with the color it puts on them. A preset can run through steps, each with
// a look of its own.
test.describe('Presets', () => {
  test.beforeEach(async ({ api }) => {
    api.patchTemplate(
      { profile: 'test/rgb-par', name: 'Par left' },
      { profile: 'test/rgb-par', name: 'Par right' },
      { profile: 'test/moving-head', name: 'Spot' }
    );
  });

  test('adds a preset to the scene, lights its fixtures in a color and marks it with that color', async ({ designer }) => {
    await designer.open();
    const presets = designer.panel('Presets');
    const scenes = designer.panel('Scenes');

    // the new preset is added on top of the selected scene, and opened in the editor
    await designer.clickTool(presets, 'fa-plus', 'Add preset');
    await expect(designer.names(presets)).toHaveText(['New Preset', 'New Preset']);
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Preset', 'New Preset']);

    await designer.row(presets, 'New Preset').first().getByRole('button', { name: '...' }).click();
    const settings = designer.dialog('Name');
    await settings.getByRole('textbox').first().fill('Red wash');
    await settings.getByRole('button', { name: 'OK' }).click();
    await expect(settings).toBeHidden();
    await expect(designer.names(presets)).toHaveText(['Red wash', 'New Preset']);
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'Red wash', 'New Preset']);
    await expect(designer.editTarget).toHaveText('Red wash');

    await expect(designer.editor.getByText('Select at least one fixture for this preset')).toBeVisible();
    const fixtures = designer.panel('Fixtures');
    await designer.row(fixtures, 'Par left').getByRole('checkbox').check();
    await designer.row(fixtures, 'Par right').getByRole('checkbox').check();

    // the pars can be dimmed and colored, nothing else
    await expect(designer.colorCheckbox).not.toBeChecked();
    await expect(designer.editor.getByRole('checkbox', { name: 'Pan/Tilt' })).toBeHidden();

    expect(await designer.previewLitIn('red')).toBeLessThan(0.001);
    await designer.dimmerField.fill('100');
    const red = await designer.pickHue(0);
    expect(red).toMatch(/^#ff[0-3][0-9a-f][0-3][0-9a-f]$/);

    // the preset is marked with the color it puts on its fixtures, the scene playing it as well
    const redWash = designer.row(presets, 'Red wash');
    await expect.poll(() => designer.markColor(redWash)).toBe(rgb(red));
    await expect.poll(() => designer.markColor(designer.row(scenes, 'New Scene'))).toBe(rgb(red));
    await expect.poll(() => designer.editTargetColor()).toBe(rgb(red));

    // and the preview plays the scene: the two pars shine red
    await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.01);
  });

  test('shows the capabilities of the fixtures selected for the preset', async ({ designer }) => {
    await designer.open();
    const fixtures = designer.panel('Fixtures');

    await designer.row(fixtures, 'Spot').getByRole('checkbox').check();
    await expect(designer.editor.getByRole('checkbox', { name: 'Pan/Tilt' })).toBeVisible();
    // its color wheel, next to the color the wheel comes closest to
    await expect(designer.editor.getByRole('checkbox', { name: 'Color', exact: true })).toHaveCount(2);

    await designer.row(fixtures, 'Spot').getByRole('checkbox').uncheck();
    await designer.row(fixtures, 'Par left').getByRole('checkbox').check();
    await expect(designer.editor.getByRole('checkbox', { name: 'Pan/Tilt' })).toBeHidden();
    await expect(designer.editor.getByRole('checkbox', { name: 'Color', exact: true })).toHaveCount(1);

    // a dimmer typed in is taken into the preset
    await designer.dimmerField.fill('40');
    await expect(designer.dimmerCheckbox).toBeChecked();
    await designer.row(fixtures, 'Par right').getByRole('checkbox').check();
    await expect(designer.dimmerField).toHaveValue('40');
  });

  test('points a moving head with the square and aims it at a spot clicked on the stage', async ({ designer, page }) => {
    await designer.open();
    await designer.row(designer.panel('Fixtures'), 'Spot').getByRole('checkbox').check();

    // a quarter of the way to the right and up: 135° of the pan, 67.5° of the tilt
    const pad = designer.editor.getByRole('slider', { name: 'Position' });
    const box = await pad.boundingBox();
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25);

    await expect(designer.editor.getByRole('checkbox', { name: 'Pan/Tilt' })).toBeChecked();
    const panDegrees = designer.editor.locator('input[name="panDegrees"]');
    await expect(panDegrees).toHaveValue('135');
    await expect(designer.editor.locator('input[name="tiltDegrees"]')).toHaveValue('67.5');

    // a degree further with the arrow key
    await pad.focus();
    await page.keyboard.press('ArrowRight');
    await expect(panDegrees).toHaveValue('136');

    // the stage takes the next click as the spot the head points at
    await designer.editor.getByRole('button', { name: 'Pick a spot' }).click();
    const stage = page.locator('.preview-picking-spot');
    await expect(stage).toBeVisible();
    const stageBox = await stage.boundingBox();
    await page.mouse.click(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height * 0.9);

    await expect(designer.editor.getByRole('button', { name: 'Stop aiming' })).toBeVisible();
    await expect(stage).toHaveCount(0);
    await expect(designer.editor.locator('input[name="aim1"]')).toBeVisible();

    // pointed by hand again, where it pointed before
    await designer.editor.getByRole('button', { name: 'Stop aiming' }).click();
    await expect(panDegrees).toHaveValue('136');
  });

  test('gives each step of a preset a look of its own', async ({ designer }) => {
    await designer.open();
    const presets = designer.panel('Presets');
    await designer.row(designer.panel('Fixtures'), 'Par left').getByRole('checkbox').check();
    await designer.dimmerField.fill('100');
    const red = await designer.pickHue(0);

    // the steps show next to the editor
    await designer.clickTool(designer.rail, 'fa-tasks', 'Steps');
    const steps = designer.steps;
    await expect(steps.getByText('1', { exact: true })).toBeVisible();
    await designer.clickTool(steps, 'fa-plus', 'Add step');
    await expect(steps.getByText('2', { exact: true })).toBeVisible();

    // the second step starts out like the first one and is edited now
    await expect(designer.colorField).toHaveValue(red);
    const blue = await designer.pickHue(240);
    expect(blue).toMatch(/^#[0-3][0-9a-f][0-3][0-9a-f]ff$/);
    await expect.poll(() => designer.previewLitIn('blue')).toBeGreaterThan(0.005);

    // the preset is still marked with the look it opens with
    await expect.poll(() => designer.markColor(designer.row(presets, 'New Preset'))).toBe(rgb(red));

    await steps.getByText('1', { exact: true }).click();
    await expect(designer.colorField).toHaveValue(red);
    await steps.getByText('2', { exact: true }).click();
    await expect(designer.colorField).toHaveValue(blue);
  });
});
