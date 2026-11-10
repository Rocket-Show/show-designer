import { Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { apiUrl } from '../e2e/fake-api';
import { expect, jane, test } from '../e2e/designer';

// The pictures of the online designer on the website (rocketshow.net/lighting-designer and the pages showing the
// designer): the designer as the dev server serves it, with the demo project of the documentation screenshots of Rocket
// Show (docs/screenshots in the rocketshow repository) opened by Jane, signed in. No request reaches the AI: the fake API
// answers the looks below. See README.md.

const demoProject = resolve(
  process.env.DEMO_PROJECT || join(__dirname, '../../../rocketshow/docs/screenshots/demo-data/designer/project-summer-tour-2026.json')
);
const outDir = resolve(process.env.OUT_DIR || join(__dirname, '../../../spark/website/assets/images'));
// where each picture goes in there: the AI on the documentation page too, which has its pictures in docs/
const files: { [name: string]: string } = { preview: 'preview', 'designer-ai': 'docs/designer-ai' };

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

async function shoot(page: Page, name: string) {
  await page.mouse.move(0, 0);
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
  await page.waitForTimeout(300);
  await saveWebp(page, await page.screenshot({ animations: 'disabled', timeout: 60_000 }), name);
}

test.describe('Website pictures of the online designer', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ api, page }) => {
    // the demo project, saved by Jane and opened again on her next visit
    const project = JSON.parse(readFileSync(demoProject, 'utf8'));
    const id = api.addProject(jane.email, project);
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

  test('preview: the designer with the chorus on the 3D stage', async ({ designer, page }) => {
    await designer.open();
    await expect(designer.row(designer.panel('Scenes'), 'Chorus')).toBeVisible();
    await page.waitForTimeout(4000);
    await shoot(page, 'preview');
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
});
