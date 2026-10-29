import { Designer, expect, test } from './designer';

// a composition which plays the scenes on their own clock
async function addComposition(designer: Designer, name: string) {
  await designer.page.getByRole('link', { name: 'Create a composition to synchronize the scenes' }).click();
  // (its title is the name of the composition)
  const settings = designer.dialog('Synchronization');
  await settings.getByRole('textbox').first().fill(name);
  await settings.getByRole('combobox').selectOption({ label: 'None' });
  await expect(settings.getByText('The scenes play on their own clock.')).toBeVisible();
  await settings.getByRole('button', { name: 'OK' }).click();
  await expect(settings).toBeHidden();
}

// A scene plays presets together. Put on a track of the timeline of a composition, it plays at its time, and the
// preview shows what the timeline plays while it runs.
test.describe('Scenes on the timeline', () => {
  test.beforeEach(async ({ api }) => {
    // two pars and a preset lighting them red, which no scene plays yet
    api.patchTemplate({ profile: 'test/rgb-par', name: 'Par left' }, { profile: 'test/rgb-par', name: 'Par right' });
    api.template.presets.push({
      uuid: 'red-wash',
      name: 'Red wash',
      sortIndex: 1,
      fixtures: [{ fixtureUuid: 'fixture-1' }, { fixtureUuid: 'fixture-2' }],
      steps: [
        {
          uuid: 'red-wash-step',
          fixtureCapabilityValues: [
            { type: 'Intensity', valuePercentage: 1 },
            { type: 'ColorIntensity', color: 'Red', valuePercentage: 1 },
            { type: 'ColorIntensity', color: 'Green', valuePercentage: 0 },
            { type: 'ColorIntensity', color: 'Blue', valuePercentage: 0 },
          ],
        },
      ],
    });
  });

  test('plays a scene put on a track of a composition without an audio file', async ({ designer }) => {
    await designer.open();
    const scenes = designer.panel('Scenes');
    const presets = designer.panel('Presets');

    // a new scene above the selected one, playing the red preset
    await designer.clickTool(scenes, 'fa-plus', 'Add scene');
    await expect(designer.names(scenes)).toHaveText(['New Scene', 'New Scene', 'New Preset']);
    await designer.row(scenes, 'New Scene').first().getByRole('button', { name: '...' }).click();
    const settings = designer.dialog('Name');
    await settings.getByRole('textbox').first().fill('Finale');
    await settings.getByRole('button', { name: 'OK' }).click();
    await expect(settings).toBeHidden();
    await designer.row(presets, 'Red wash').getByRole('checkbox').check();
    await expect(designer.names(scenes)).toHaveText(['Finale', 'Red wash', 'New Scene', 'New Preset']);

    await addComposition(designer, 'Opener');
    const timeline = designer.timeline;
    await expect(timeline.getByRole('combobox')).toHaveText('Opener');
    await expect(timeline.getByText('Drag a scene here, or draw the selected one, to play it on a track')).toBeVisible();

    // the selected scene goes onto a track of its own, where the playback stands, for four bars
    await designer.clickTool(timeline, 'fa-file-o', 'Add new region');
    await expect(timeline.getByText('Finale')).toHaveCount(2);
    await expect(designer.playbackTime).toHaveText('00:00.000');
    await expect(timeline.getByText('- 00:08.000')).toBeVisible();

    // the preview plays the selected scene, the timeline while it plays
    await designer.row(scenes, 'New Scene').click();
    await expect.poll(() => designer.previewLitIn('red')).toBeLessThan(0.001);

    await designer.clickTool(timeline, 'fa-play');
    await expect(designer.playbackTime).not.toHaveText('00:00.000');
    await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.01);

    await designer.clickTool(timeline, 'fa-pause');
    const paused = await designer.playbackTime.textContent();
    // the clock of the timeline would have moved on by now
    await designer.page.waitForTimeout(300);
    await expect(designer.playbackTime).toHaveText(paused);
    await expect.poll(() => designer.previewLitIn('red')).toBeLessThan(0.001);

    await designer.clickTool(timeline, 'fa-step-backward');
    await expect(designer.playbackTime).toHaveText('00:00.000');
  });
});

// Without an audio file, the timeline of a composition runs on a clock of its own until the last scene on it has ended.
test.describe('The clock of the timeline', () => {
  test.use({ previewHidden: true });

  test('stops at the end of the last scene', async ({ designer, page }) => {
    await designer.open();
    await addComposition(designer, 'Short one');
    const timeline = designer.timeline;

    // the selected scene (the one of the template) for a second
    await designer.clickTool(timeline, 'fa-file-o', 'Add new region');
    const start = timeline.getByRole('textbox').nth(0);
    const end = timeline.getByRole('textbox').nth(1);
    await expect(start).toHaveValue('0');
    await expect(end).toHaveValue('8000');
    await end.fill('1000');
    await expect(timeline.getByText('- 00:01.000')).toBeVisible();

    // the space bar plays, as long as no field takes the keys
    await end.blur();
    await page.keyboard.press(' ');
    await expect(designer.tool(timeline, 'fa-pause')).toBeVisible();
    await expect(designer.playbackTime).toHaveText('00:01.000');
    await expect(designer.tool(timeline, 'fa-play')).toBeVisible();

    // played again from the start
    await page.keyboard.press(' ');
    await expect(designer.playbackTime).not.toHaveText('00:01.000');
    await page.keyboard.press(' ');
    await expect(designer.tool(timeline, 'fa-play')).toBeVisible();
  });
});
