import { Locator, Page } from '@playwright/test';
import { FakeApi } from './fake-api';
import { Designer, expect, jane, test } from './designer';

// a preset of the looks with everything it can set left out
const nothing = {
  order: 'rig',
  wings: false,
  dimmer: null,
  dimmerFan: null,
  color: null,
  colorGradient: null,
  colorSequence: null,
  zoom: null,
  zoomFan: null,
  position: null,
  movement: null,
  dimmerEffect: null,
  pixel: null,
  gobo: null,
  prism: null,
  strobe: null,
};

// The looks the AI answers for the rig of the tests: a gradient over the pars fanned out from the middle, the moving
// heads fanned around the middle of the stage moving in a figure 8, a chase over the pixels of the bars
export const neonNight = {
  name: 'Neon night',
  summary: 'Deep blue verses building up to a pink and cyan chorus with sweeping beams.',
  presets: [
    { ...nothing, id: 'blue-wash', name: 'Deep blue wash', groups: ['rgb-par'], dimmer: 0.6, color: '#2040ff' },
    {
      ...nothing,
      id: 'neon-wash',
      name: 'Pink to cyan wash',
      groups: ['rgb-par'],
      order: 'left-right',
      dimmerFan: { shape: 'center', from: 1, to: 0.6 },
      colorGradient: { colors: ['#ff1050', '#00e5ff'], blend: 'smooth' },
    },
    {
      ...nothing,
      id: 'beams',
      name: 'Sweeping beams',
      groups: ['moving-head'],
      dimmer: 1,
      color: '#0000ff',
      position: { aim: 'center', fanDegrees: 60, fanShape: 'center' },
      movement: { shape: 'figure8', panDegrees: 40, tiltDegrees: 16, beats: 8, chase: 'none', fan: 'linear' },
    },
    {
      ...nothing,
      id: 'bars',
      name: 'Neon chase',
      groups: ['bar-of-three-pixels'],
      dimmer: 1,
      pixel: { pattern: 'chase', palette: 'neon', colors: [], beats: 2, direction: 'out', size: 0.4 },
    },
  ],
  scenes: [
    { name: 'Intro', section: 'intro', energy: 1, presets: ['blue-wash'], fadeInBeats: 8, fadeOutBeats: 4 },
    { name: 'Verse', section: 'verse', energy: 2, presets: ['bars', 'blue-wash'], fadeInBeats: 4, fadeOutBeats: 2 },
    { name: 'Chorus', section: 'chorus', energy: 5, presets: ['beams', 'bars', 'neon-wash'], fadeInBeats: 0, fadeOutBeats: 2 },
    { name: 'Blackout', section: 'blackout', energy: 1, presets: [], fadeInBeats: 0, fadeOutBeats: 0 },
  ],
};

// a project with four pars at the front, two moving heads at the back and two bars of pixels on the floor
export function patchRig(api: FakeApi) {
  api.addTestProfile('pixel-bar.json');
  api.patchTemplate(
    { profile: 'test/rgb-par', name: 'Par 1' },
    { profile: 'test/rgb-par', name: 'Par 2' },
    { profile: 'test/rgb-par', name: 'Par 3' },
    { profile: 'test/rgb-par', name: 'Par 4' },
    { profile: 'test/moving-head', name: 'Head left' },
    { profile: 'test/moving-head', name: 'Head right' },
    { profile: 'test/pixel-bar', name: 'Bar left' },
    { profile: 'test/pixel-bar', name: 'Bar right' }
  );
  const fixtures = api.template.fixtures;
  fixtures.slice(4, 6).forEach((fixture: any) => (fixture.positioning = 'topBack'));
  fixtures.slice(6, 8).forEach((fixture: any) => (fixture.positioning = 'bottomFront'));
}

async function openAiLooks(designer: Designer) {
  await designer.clickTool(designer.panel('Scenes'), 'fa-magic', 'Design scenes with AI');
}

// the panel of the AI looks beside the designer
function aiPanel(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Design with AI' });
}

// The AI designs presets and scenes for the fixtures of the project (see show-designer-api/ai-looks.php in the spark
// repository): the user describes the looks and picks colors, a mood, the energy and the tempo, gets the scenes and
// adds them to the project, ready to be triggered.
test.describe('AI looks', () => {
  test.beforeEach(async ({ api }) => {
    patchRig(api);
    api.aiLooks = [neonNight];
  });

  test('asks a visitor to log in first, like saving does', async ({ designer, api, page }) => {
    await designer.open();
    await openAiLooks(designer);

    const register = designer.dialog('Register');
    await expect(register.getByRole('alert')).toHaveText('Please sign in to proceed.');
    await register.getByText('You already have an account?').click();
    const login = designer.dialog('Login');
    await login.getByLabel('Email', { exact: true }).fill(jane.email);
    await login.getByLabel('Password', { exact: true }).fill(jane.password);
    await login.getByRole('button', { name: 'Login' }).click();

    // logged in, the panel opens with the fixtures of the project in groups
    const dialog = aiPanel(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('The AI designs for these fixtures')).toBeVisible();
    await expect(dialog.locator('.ai-groups li')).toHaveText([
      /RGB par\s*4×\s*Truss, front/,
      /Moving head\s*2×\s*Truss, back/,
      /Bar of three pixels\s*2×\s*Floor, front/,
    ]);
    await expect(dialog.getByText('20 of 20 requests left today')).toBeVisible();
    expect(api.requestsTo('GET ai-looks').length).toBe(1);
    expect(api.requestsTo('GET ai-looks')[0].authorization).toMatch(/^session-/);
  });

  test.describe('signed in', () => {
    test.use({ signedIn: true });

    test('designs scenes for the fixtures and adds them to the project, ready to trigger', async ({ designer, api, page }) => {
      // the whole flow, and the 3D preview looked at twice: slower than most on the machines of CI
      test.slow();

      await designer.open();
      await openAiLooks(designer);
      const dialog = aiPanel(page);

      await dialog.getByLabel('What should the show look like?').fill('Synthwave, building up to a big chorus');
      await dialog.getByRole('button', { name: 'A song' }).click();
      await dialog.getByRole('button', { name: 'Party' }).click();
      await dialog.getByRole('button', { name: 'Color' }).click();
      await dialog.getByLabel('Tempo (BPM)').fill('128');
      await dialog.getByRole('button', { name: 'Big' }).click();
      await dialog.getByRole('button', { name: 'Design', exact: true }).click();

      // the scenes the AI designed, with what they layer: the first one plays on the stage, outside the project
      await expect(dialog.getByRole('heading', { name: 'Neon night' })).toBeVisible();
      await expect(dialog.locator('.ai-scene')).toHaveCount(4);
      await expect(dialog.locator('.ai-scene').nth(2)).toContainText('Chorus');
      await expect(dialog.locator('.ai-scene').nth(2)).toContainText('Sweeping beams, Neon chase, Pink to cyan wash');
      await expect(dialog.getByText('19 of 20 requests left today')).toBeVisible();
      await expect(designer.previewPanel).toContainText('Not in your project yet');
      await expect(designer.previewPanel).toContainText('Intro');
      await expect.poll(() => designer.previewLitIn('blue')).toBeGreaterThan(0.001);
      await expect(designer.row(designer.panel('Scenes'), 'Neon night')).toHaveCount(0);

      // what the designer asked for: the groups of the fixtures and the settings, for the user who is logged in
      const [request] = api.requestsTo('POST ai-looks');
      expect(request.authorization).toMatch(/^session-/);
      expect(request.body.rig.groups.map((group: any) => [group.id, group.count, group.position, group.abilities])).toEqual([
        ['rgb-par', 4, 'top-front', ['dimmer', 'color', 'strobe']],
        ['moving-head', 2, 'top-back', ['dimmer', 'color', 'pan-tilt', 'strobe']],
        ['bar-of-three-pixels', 2, 'floor-front', ['dimmer', 'color', 'pixels']],
      ]);
      expect(request.body.settings).toEqual({
        output: 'song',
        colors: ['#ff2fa0'],
        palette: null,
        mood: 'party',
        energy: 3,
        bpm: 128,
        movement: 'big',
        contrast: 0.5,
        strobe: false,
      });
      expect(request.body.prompt).toBe('Synthwave, building up to a big chorus');

      // the chorus on the stage plays the gradient over the pars: from pink (red) to cyan (blue)
      await dialog.locator('.ai-scene-play').nth(2).click();
      await expect(designer.previewPanel).toContainText('Chorus');
      await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.001);
      await expect.poll(() => designer.previewLitIn('blue')).toBeGreaterThan(0.001);

      // all but the blackout added, the chorus playing on
      await dialog.getByRole('checkbox', { name: 'Add Blackout to the project' }).uncheck();
      await dialog.getByRole('button', { name: 'Add to project (3)' }).click();
      await expect(dialog).toBeHidden();
      await expect(designer.toast('3 scenes and 4 presets added.')).toBeVisible();
      await expect(designer.previewPanel).not.toContainText('Not in your project yet');

      // the scenes in a folder named after the looks
      const scenes = designer.panel('Scenes');
      await expect(designer.row(scenes, 'Neon night')).toBeVisible();
      for (const name of ['Intro', 'Verse', 'Chorus']) {
        await expect(designer.row(scenes, name)).toBeVisible();
      }
      await expect(designer.row(scenes, 'Blackout')).toHaveCount(0);
      const presets = designer.panel('Presets');
      for (const name of ['Deep blue wash', 'Pink to cyan wash', 'Sweeping beams', 'Neon chase']) {
        await expect(designer.row(presets, name)).toBeVisible();
      }
      await expect(designer.previewPanel).toContainText('Chorus');
      await expect.poll(() => designer.previewLitIn('red')).toBeGreaterThan(0.001);

      // all of it goes with one undo
      await designer.menu('Edit', 'Undo');
      await expect(designer.row(scenes, 'Neon night')).toHaveCount(0);
      await expect(designer.row(presets, 'Sweeping beams')).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    test('lets go of the looks without adding anything', async ({ designer, page }) => {
      await designer.open();
      await openAiLooks(designer);
      const panel = aiPanel(page);

      await panel.getByRole('button', { name: 'Design', exact: true }).click();
      await expect(designer.previewPanel).toContainText('Not in your project yet');
      await panel.getByRole('button', { name: 'Discard' }).click();

      await expect(panel).toBeHidden();
      await expect(designer.previewPanel).not.toContainText('Not in your project yet');
      await expect(designer.row(designer.panel('Scenes'), 'Neon night')).toHaveCount(0);

      // and starts afresh the next time
      await openAiLooks(designer);
      await expect(panel.getByLabel('What should the show look like?')).toBeVisible();
    });

    test('changes the looks as the user says', async ({ designer, api, page }) => {
      api.aiLooks = [neonNight, { ...neonNight, name: 'Warm night', scenes: neonNight.scenes.slice(0, 2) }];
      await designer.open();
      await openAiLooks(designer);
      const dialog = aiPanel(page);

      await dialog.getByRole('button', { name: 'Design', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Neon night' })).toBeVisible();

      await dialog.getByLabel('Change the looks').fill('Warmer, and fewer scenes');
      await dialog.getByRole('button', { name: 'Change', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Warm night' })).toBeVisible();
      await expect(dialog.locator('.ai-scene')).toHaveCount(2);

      const [, change] = api.requestsTo('POST ai-looks');
      expect(change.body.current.name).toBe('Neon night');
      expect(change.body.instruction).toBe('Warmer, and fewer scenes');

      // back to the settings, as they were picked
      await dialog.getByRole('button', { name: 'Back' }).click();
      await expect(dialog.getByLabel('What should the show look like?')).toBeVisible();
    });

    test('tells the user when the AI can not design the looks', async ({ designer, api, page }) => {
      await designer.open();
      api.fail('POST ai-looks', 429, 'ai-user-limit-reached');
      await openAiLooks(designer);
      const dialog = aiPanel(page);

      await dialog.getByRole('button', { name: 'Design', exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText("You've used all your requests for today. Please try again tomorrow.");
      // the settings stay, to try again later
      await expect(dialog.getByLabel('What should the show look like?')).toBeVisible();
    });

    test('says so when the server has no AI looks', async ({ designer, api, page }) => {
      api.aiAvailable = false;
      await designer.open();
      await openAiLooks(designer);
      const dialog = aiPanel(page);

      await expect(dialog.getByRole('alert')).toHaveText("The AI looks aren't available on this server.");
      await expect(dialog.getByRole('button', { name: 'Design', exact: true })).toBeDisabled();
    });
  });

  test.describe('for a new visitor', () => {
    test.use({ signedIn: true, introSeen: false, aiTipSeen: false });

    test('is offered in the welcome tour, in the menu bar, in the scenes and once as a tip', async ({ designer, page }) => {
      await designer.open();
      const tip = page.getByRole('dialog', { name: 'Let AI design your looks' });

      // the tour offers it where it starts, the tip waits for the tour
      await expect(page.getByText('No time for the tour?')).toBeVisible();
      await expect(tip).toBeHidden();
      await page.locator('.intro-ai').getByRole('button', { name: 'Design with AI' }).click();
      await expect(aiPanel(page)).toBeVisible();
      await expect(page.getByText('No time for the tour?')).toBeHidden();
      await aiPanel(page).getByRole('button', { name: 'Close' }).click();

      // nothing designed yet: the scenes offer it in a card
      const scenes = designer.panel('Scenes');
      await expect(scenes.getByText('Let AI light your show')).toBeVisible();
      await scenes.getByRole('button', { name: 'Design with AI' }).click();
      await expect(aiPanel(page)).toBeVisible();
      await aiPanel(page).getByRole('button', { name: 'Close' }).click();

      // the tip, once
      await expect(tip).toBeVisible();
      await tip.getByRole('button', { name: 'Not now' }).click();
      await expect(tip).toBeHidden();
      await page.reload();
      await expect(page.locator('.ai-start-button')).toBeVisible();
      await expect(tip).toBeHidden();

      // and the menu bar, always
      await page.locator('.ai-start-button').click();
      await expect(aiPanel(page)).toBeVisible();
    });
  });
});
