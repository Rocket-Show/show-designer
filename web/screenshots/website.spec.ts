import { Locator, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { apiUrl, FakeApi } from '../e2e/fake-api';
import { expect, jane, test } from '../e2e/designer';

// The pictures of the online designer on the website (rocketshow.net/lighting-designer and the pages showing the
// designer): the designer as the dev server serves it, with the demo project of the documentation screenshots of Rocket
// Show (docs/screenshots in the rocketshow repository) opened by Jane, signed in. No request reaches the AI: the fake API
// answers the looks below. See README.md.

const demoProject = resolve(
  process.env.DEMO_PROJECT || join(__dirname, '../../../rocketshow/docs/screenshots/demo-data/designer/project-summer-tour-2026.json')
);
const outDir = resolve(process.env.OUT_DIR || join(__dirname, '../../../spark/website/assets/images'));
// where each picture goes in there: the AI on the documentation page too, which has its pictures in docs/, like the
// fixture pool and the profiles of the AI
const files: { [name: string]: string } = {
  'designer-ai': 'docs/designer-ai',
  'designer-fixture-pool': 'docs/designer-fixture-pool',
  'designer-add-profile': 'docs/designer-add-profile',
  'designer-ai-fixture': 'docs/designer-ai-fixture',
};

// 1600 x 923 pixels, the size the pages reserve for them
test.use({ signedIn: true, viewport: { width: 1280, height: 738 }, deviceScaleFactor: 1.25, colorScheme: 'dark' });

// the looks the AI answers, for the groups of fixtures the designer sent: a wash in deep blue and one fading from pink to
// cyan over the pars, the moving heads fanned and sweeping, a chase over the pixels of the bars
function looksFor(groups: { id: string; abilities: string[] }[]): any {
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
  const ids = (test: (abilities: string[]) => boolean) => groups.filter((group) => test(group.abilities)).map((group) => group.id);
  const heads = ids((abilities) => abilities.includes('pan-tilt'));
  const bars = ids((abilities) => abilities.includes('pixels'));
  const washes = ids((abilities) => abilities.includes('color') && !abilities.includes('pan-tilt') && !abilities.includes('pixels'));

  return {
    name: 'Neon night',
    summary: 'Deep blue verses building up to a pink and cyan chorus, with sweeping beams and the bars chasing the beat.',
    presets: [
      { ...nothing, id: 'blue-wash', name: 'Deep blue wash', groups: washes, dimmer: 0.6, color: '#2040ff' },
      {
        ...nothing,
        id: 'neon-wash',
        name: 'Pink to cyan wash',
        groups: washes,
        order: 'left-right',
        dimmerFan: { shape: 'center', from: 1, to: 0.6 },
        colorGradient: { colors: ['#ff1050', '#00e5ff'], blend: 'smooth' },
      },
      {
        ...nothing,
        id: 'beams',
        name: 'Sweeping beams',
        groups: heads,
        dimmer: 1,
        color: '#ff10c0',
        position: { aim: 'center', fanDegrees: 70, fanShape: 'center' },
        movement: { shape: 'figure8', panDegrees: 40, tiltDegrees: 16, beats: 8, chase: 'none', fan: 'linear' },
      },
      {
        ...nothing,
        id: 'bars',
        name: 'Neon chase',
        groups: bars,
        dimmer: 1,
        pixel: { pattern: 'chase', palette: 'neon', colors: [], beats: 2, direction: 'out', size: 0.4 },
      },
    ],
    scenes: [
      { name: 'Intro', section: 'intro', energy: 1, presets: ['blue-wash'], fadeInBeats: 8, fadeOutBeats: 4 },
      { name: 'Verse', section: 'verse', energy: 2, presets: ['bars', 'blue-wash'], fadeInBeats: 4, fadeOutBeats: 2 },
      { name: 'Pre-chorus', section: 'pre-chorus', energy: 3, presets: ['beams', 'blue-wash'], fadeInBeats: 2, fadeOutBeats: 0 },
      { name: 'Chorus', section: 'chorus', energy: 5, presets: ['beams', 'bars', 'neon-wash'], fadeInBeats: 0, fadeOutBeats: 2 },
      { name: 'Outro', section: 'outro', energy: 2, presets: ['neon-wash'], fadeInBeats: 4, fadeOutBeats: 8 },
      { name: 'Blackout', section: 'blackout', energy: 1, presets: [], fadeInBeats: 0, fadeOutBeats: 0 },
    ],
  };
}

// A stand-in for the audio file of the demo composition, so the timeline has a waveform to draw: the same one the
// documentation screenshots of Rocket Show generate, quiet verses and loud choruses at 120 BPM
function demoAudio(durationSeconds: number): Buffer {
  const rate = 8000;
  const samples = durationSeconds * rate;
  const sections = [
    [0, 15, 0.35],
    [15, 45, 0.45],
    [45, 75, 0.9],
    [75, 105, 0.45],
    [105, 135, 0.9],
    [135, 165, 0.55],
    [165, 167, 1.0],
    [167, 205, 0.95],
    [205, 243, 0.4],
    [243, 9999, 0.05],
  ];
  const buffer = Buffer.alloc(44 + samples);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples, 40);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const beat = rate / 2;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const level = sections.find(([a, b]) => t >= a && t < b)[2];
    const inBeat = (i % beat) / beat;
    const kick = Math.exp(-inBeat * 18) * Math.sin(2 * Math.PI * 55 * t);
    const hat = (Math.floor(i / (beat / 2)) % 2 ? 0.25 : 0.12) * Math.exp(-((i % (beat / 2)) / (beat / 2)) * 30) * noise();
    const pad = 0.25 * Math.sin(2 * Math.PI * 110 * t) * (0.6 + 0.4 * Math.sin((2 * Math.PI * t) / 8));
    const value = Math.max(-1, Math.min(1, level * (0.7 * kick + hat + pad)));
    buffer[44 + i] = Math.round(128 + value * 120);
  }
  return buffer;
}

// how the designer shares the room between its panels (see LayoutService): a little more for the timeline
const layout = JSON.stringify({
  folded: [],
  shares: { 'row-0': 44, 'row-1': 33, 'row-2': 23, scenes: 20, presets: 20, preview: 60, editor: 70, fixtures: 24, master: 6 },
  layout: 'default',
});

// PNG in, WebP out, encoded by the browser like the documentation screenshots of Rocket Show
async function saveWebp(page: Page, png: Buffer, name: string) {
  const encoder = await page.context().newPage();
  const dataUrl = await encoder.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.82);
  }, png.toString('base64'));
  await encoder.close();
  const file = join(outDir, files[name] + '.webp');
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// the page, a part of it (e.g. a dialog) or the area passed
async function shoot(page: Page, name: string, part?: Locator | { x: number; y: number; width: number; height: number }) {
  await page.mouse.move(0, 0);
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
  await page.waitForTimeout(300);
  const options = { animations: 'disabled' as const, timeout: 60_000 };
  const png =
    part && 'screenshot' in part
      ? await part.screenshot(options)
      : await page.screenshot({ ...options, clip: part as { x: number; y: number; width: number; height: number } });
  await saveWebp(page, png, name);
}

// The fixture library as it knows the profiles of the demo project: the par and the moving head as the Open Fixture
// Library has them, the pixel bar as well, and in a version the AI made from its manual since, doing the mode
// differently, which the users confirmed and the library takes as the best one. The left bar of the demo was added from
// the version of the Open Fixture Library: the fixture pool marks it with the better version, which the right bar
// plays already. The project keeps the versions with their copies of the profiles, the universe its fixtures are
// patched in as well (the device the demo comes from names it itself).
function libraryOfTheDemo(api: FakeApi, project: any) {
  const mode = (shortName: string, hash: string, state = 'open', good = 0, bad = 0) => ({ shortName, hash, state, good, bad });
  const versions = [
    {
      uuid: 'generic/led-pixel-bar-8~1',
      origin: 'ofl',
      state: 'open',
      usage: 9,
      versions: 2,
      best: false,
      bestUuid: 'generic/led-pixel-bar-8~2',
      modeStates: [mode('25ch', 'bar-25ch-1')],
    },
    {
      uuid: 'generic/led-pixel-bar-8~2',
      origin: 'ai',
      state: 'confirmed',
      confirmations: 4,
      problems: 0,
      usage: 12,
      versions: 2,
      best: true,
      created: '2026-10-14',
      manual: { name: 'led-pixel-bar-8-manual.pdf' },
      modeStates: [mode('25ch', 'bar-25ch-2', 'confirmed', 4, 0)],
    },
    {
      uuid: 'generic/rgbw-par~1',
      origin: 'ofl',
      state: 'open',
      usage: 318,
      versions: 1,
      best: true,
      modeStates: [mode('4ch', 'par-4ch'), mode('6ch', 'par-6ch')],
    },
    {
      uuid: 'stairville/mh-100~1',
      origin: 'ofl',
      state: 'confirmed',
      confirmations: 7,
      problems: 0,
      usage: 41,
      versions: 2,
      best: true,
      modeStates: [mode('9ch', 'mh-9ch', 'confirmed', 7, 0), mode('14ch', 'mh-14ch')],
    },
    {
      uuid: 'stairville/mh-100~2',
      origin: 'ai',
      state: 'open',
      usage: 1,
      versions: 2,
      best: false,
      created: '2026-11-03',
      modeStates: [mode('9ch', 'mh-9ch'), mode('14ch', 'mh-14ch-2')],
    },
  ];
  const copies: any[] = [];

  api.library.length = 0;

  for (const version of versions) {
    const fixture = version.uuid.split('~')[0];
    const copy = project.fixtureProfiles.find((candidate: any) => candidate.uuid === fixture);
    const profile = JSON.parse(readFileSync(join(dirname(demoProject), 'profile-' + fixture.replace('/', '-') + '.json'), 'utf8'));
    const { name, manufacturerShortName, manufacturerName } = copy;

    api.library.push({ name, manufacturerShortName, manufacturerName, mainCategory: copy.categories[0], profile, fixture, ...version });

    // the project has a copy of the versions its fixtures play
    if (version.uuid !== 'stairville/mh-100~2') {
      copies.push({ ...copy, ...version });
    }
  }

  // the first version of each, the best one of the bar for the right bar
  project.fixtureProfiles = copies;
  for (const fixture of project.fixtures) {
    fixture.profileUuid += fixture.name === 'LED bar right' ? '~2' : '~1';
  }
  project.universes = [{ uuid: project.fixtures[0].dmxUniverseUuid, name: 'Universe 1' }];
}

test.describe('Website pictures of the online designer', () => {
  test.setTimeout(180_000);

  // the demo project as the API holds it, saved by Jane
  let project: any;

  test.beforeEach(async ({ api, page }) => {
    // the demo project, saved by Jane and opened again on her next visit
    project = JSON.parse(readFileSync(demoProject, 'utf8'));
    const id = api.addProject(jane.email, project);
    project = api.savedProject(id);
    await page.addInitScript(
      ([projectId, projectName, designerLayout]) => {
        localStorage.setItem('projectId', projectId);
        localStorage.setItem('projectName', projectName);
        localStorage.setItem('designerLayout', designerLayout);
      },
      ['' + id, project.name, layout]
    );

    // the audio file of the composition on the timeline
    const audio = demoAudio(245);
    await page
      .context()
      .route(apiUrl + 'composition-files/**', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: audio }));

    // the AI answers looks for the fixtures of the demo project
    await page.context().route(apiUrl + 'ai-looks**', async (route) => {
      if (route.request().method() !== 'POST') {
        return route.fallback();
      }
      const body = JSON.parse(route.request().postData() || '{}');
      await new Promise((done) => setTimeout(done, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ looks: looksFor(body.rig.groups), requestsLast24Hours: 3, requestsPerUserPerDay: 20 }),
      });
    });
  });

  test('designer-ai: the AI designing the looks of a song for the rig', async ({ designer, page }) => {
    await designer.open();
    await page.locator('.ai-start-button').click();
    const panel = page.getByRole('complementary', { name: 'Design with AI' });
    await panel.getByLabel('What should the show look like?').fill('A synthwave song in pink and cyan, building up to a big chorus');
    await panel.getByRole('button', { name: 'A song' }).click();
    await panel.getByRole('button', { name: 'Party' }).click();
    await panel.getByLabel('Tempo (BPM)').fill('128');
    await panel.getByRole('button', { name: 'Big' }).click();
    await panel.getByRole('button', { name: 'Design', exact: true }).click();

    // the chorus the AI designed, played on the stage before it is added to the project
    await expect(panel.getByRole('heading', { name: 'Neon night' })).toBeVisible();
    await panel.locator('.ai-scene-play').nth(3).click();
    await expect(designer.previewPanel).toContainText('Chorus');
    await page.waitForTimeout(4000);
    await shoot(page, 'designer-ai');
  });

  // The fixture pool and the profiles of the fixture library: the dialog alone, sharp, for the documentation
  test.describe('The fixture library', () => {
    test.use({ viewport: { width: 1400, height: 1300 }, deviceScaleFactor: 2, previewHidden: true });

    test.beforeEach(async ({ api, page }) => {
      libraryOfTheDemo(api, project);

      // the manufacturers of the library, which the AI suggests as the user types
      await page.context().route(apiUrl + 'manufacturer', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { shortName: 'generic', name: 'Generic', website: null },
            { shortName: 'stairville', name: 'Stairville', website: null },
          ]),
        })
      );
    });

    test('designer-fixture-pool: the profiles of the library, the fixtures and their patch', async ({ designer, page }) => {
      await designer.open();
      await designer.menu('Settings', 'Fixture pool');
      const pool = designer.fixturePool;

      // the best version of each fixture in the search, with where it comes from and what is known about it
      await expect(pool.locator('.list-group-item').filter({ hasText: 'Generic - LED Pixel Bar 8' })).toContainText('2 versions');

      // the left bar plays the version of the Open Fixture Library: the library has a better one
      const better = 'There is a better version, which does this mode differently.';
      await expect(designer.row(pool, 'LED bar left').getByRole('button', { name: better })).toBeVisible();
      await designer.row(pool, 'LED bar left').click();
      await expect(pool.locator('#fixtureName')).toHaveValue('LED bar left');
      await expect(pool.getByText('Does this mode work with your fixture?')).toBeVisible();
      await expect(pool.locator('.fa-spinner')).toHaveCount(0);

      // the fixtures from the last moving head on, the left bar among them
      await designer.row(pool, 'Moving head 4').evaluate((row) => row.scrollIntoView({ block: 'start' }));

      await shoot(page, 'designer-fixture-pool', pool.locator('.modal-content'));
    });

    test('designer-add-profile: the ways to add a profile the library does not have', async ({ designer, page }) => {
      await designer.open();
      await designer.menu('Settings', 'Fixture pool');
      const pool = designer.fixturePool;

      await pool.getByRole('button', { name: 'Add missing profile' }).click();
      const choices = page.locator('.add-profile-popover');
      await expect(choices.getByRole('button', { name: /Automatically, with AI/ })).toBeVisible();

      // the search and the list of the profiles with the button at its end, and the choices below it
      const search = (await pool.getByPlaceholder('Search profiles').boundingBox())!;
      const list = (await pool.locator('.profiles-card').boundingBox())!;
      const popover = (await choices.boundingBox())!;
      const left = Math.min(list.x, popover.x) - 16;
      const top = search.y - 16;
      const right = Math.max(list.x + list.width, popover.x + popover.width) + 16;
      const bottom = popover.y + popover.height + 16;
      await shoot(page, 'designer-add-profile', { x: left, y: top, width: right - left, height: bottom - top });
    });

    test('designer-ai-fixture: the review of a profile the AI made from the manual', async ({ api, designer, page }) => {
      // the profiles of the AI a user may have made a day on rocketshow.net
      api.aiRequestsPerUserPerDay = 5;

      // a generic moving head, its profile made by the AI from the manual, with where it read each channel
      const profile = JSON.parse(readFileSync(join(__dirname, '../projects/designer/conformance/profiles/test/moving-head.json'), 'utf8'));
      const name = 'Moving head spot 60 W';
      api.aiFixture = {
        version: {
          uuid: 'generic/moving-head-spot-60-w~1',
          fixture: 'generic/moving-head-spot-60-w',
          manufacturerShortName: 'generic',
          manufacturerName: 'Generic',
          name,
          origin: 'ai',
          state: 'open',
        },
        profile: { ...profile, name },
        review: {
          channels: {
            Pan: { page: 12, quote: 'CH1 Pan 0–540°', verified: true, uncertain: null },
            Tilt: { page: 12, quote: 'CH3 Tilt 0–270°', verified: true, uncertain: null },
            Dimmer: { page: 12, quote: 'CH5 Dimmer 8–134, strobe 135–255', verified: true, uncertain: null },
            'Color Wheel': { page: 13, quote: 'CH6 Color wheel, 8 colors', verified: false, uncertain: null },
          },
          uncertain: ['The color chart on page 13 lists 8 colors, the photo of the wheel on page 4 shows 7.'],
        },
      };
      await designer.open();
      await designer.menu('Settings', 'Fixture pool');
      await designer.fixturePool.getByRole('button', { name: 'Add missing profile' }).click();
      await page
        .locator('.add-profile-popover')
        .getByRole('button', { name: /Automatically, with AI/ })
        .click();

      const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Create profile with AI' }) });
      await dialog.getByLabel('Manufacturer').fill('Gen');
      await page.locator('typeahead-container').getByRole('option', { name: 'Generic' }).click();
      await dialog.getByLabel('Model').fill(name);
      await dialog
        .locator('input[type=file]')
        .setInputFiles({ name: 'moving-head-spot-60w-manual.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
      await dialog.getByRole('button', { name: 'Create with AI' }).click();

      // the review, to compare with the manual
      await expect(dialog.getByText('4 of 5 profiles left today')).toBeVisible();
      await expect(dialog.getByRole('row').filter({ hasText: 'Color Wheel' })).toContainText('not verified');
      await shoot(page, 'designer-ai-fixture', dialog.locator('.modal-content'));
    });
  });
});
