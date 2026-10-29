import { expect, Locator, Page, test as base } from '@playwright/test';

import { FakeApi } from './fake-api';

// a user who registered with the online designer before
export const jane = { email: 'jane@example.com', username: 'Jane', password: 'stage+lights&more' };

// the session Jane is signed in with, when a test starts signed in
const janeSession = 'session-of-jane';

interface Options {
  // the user has closed the intro before: most flows don't want it in the way
  introSeen: boolean;
  // the user is signed in as Jane
  signedIn: boolean;
  // the user has turned off the 3D preview, which is the most work for the browser
  previewHidden: boolean;
}

// Each test gets a fresh browser context (an empty local storage, as for a new visitor) and a fake API of its own,
// which already knows Jane
export const test = base.extend<Options & { api: FakeApi; designer: Designer }>({
  introSeen: [true, { option: true }],
  signedIn: [false, { option: true }],
  previewHidden: [false, { option: true }],

  storageState: async ({ introSeen, signedIn, previewHidden, baseURL }, use) => {
    const localStorage: { name: string; value: string }[] = [];

    if (previewHidden) {
      localStorage.push({ name: 'previewHidden', value: 'true' });
    }

    if (introSeen) {
      localStorage.push({ name: 'showIntro', value: 'false' });
    }

    if (signedIn) {
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + 30);
      localStorage.push(
        { name: 'token', value: janeSession },
        { name: 'tokenExpiration', value: expiration.toISOString() },
        { name: 'username', value: jane.username }
      );
    }

    await use({ cookies: [], origins: [{ origin: baseURL, localStorage }] });
  },

  api: async ({ context }, use) => {
    const api = new FakeApi();
    api.addUser(jane.email, jane.username, jane.password);
    api.sessions.set(janeSession, jane.email);
    await api.attach(context);
    await use(api);
  },

  designer: async ({ page, api }, use) => {
    await use(new Designer(page, api));
  },
});

export { expect };

/**
 * The designer as the user sees it. Most of it is found by what it shows (the titles of the panels and dialogs, the
 * texts of the menus, the labels and the tooltips of the buttons). Where the app gives no name to go by, a helper here
 * finds it by its structure, so the specs read the same everywhere:
 * - the rows of the trees (scenes, presets, fixtures) have no roles: they are found by their text
 * - the buttons in the headers of the panels and in the toolbars show an icon and a tooltip on hover, but they have
 *   no name: they are found by their icon, and the tooltip shown on the way checks that it is the button meant
 */
export class Designer {
  constructor(readonly page: Page, readonly api: FakeApi) {}

  // open the designer and wait until the project is there and the waiting is over
  async open(path = '/') {
    await this.page.goto(path);
    await this.loaded();
  }

  async reload() {
    await this.page.reload();
    await this.loaded();
  }

  async loaded() {
    // the name of the project is shown as soon as there is one
    await expect(this.projectName).toBeVisible();
    await expect(this.page.getByText('Please wait...')).toBeHidden();
  }

  // ---- the panels ---------------------------------------------------------------

  // a panel with a title in its header: Scenes, Presets or Fixtures
  panel(title: 'Scenes' | 'Presets' | 'Fixtures'): Locator {
    // (the panels for small screens are there as well, hidden)
    return this.page
      .locator('#designer .card.panel')
      .filter({ visible: true })
      .filter({ has: this.page.locator('.card-header').getByText(title, { exact: true }) });
  }

  // the names listed in a panel, from the top (in the scenes the scenes and the presets they play)
  names(panel: Locator): Locator {
    return panel.locator('.tree-node .tree-label .text-truncate');
  }

  // the row of a scene, a preset or a fixture
  row(panel: Locator, name: string): Locator {
    return panel.locator('.tree-node').filter({ has: this.page.getByText(name, { exact: true }) });
  }

  // the color a preset or a scene is marked with in its row of a panel: the color of its icon
  async markColor(row: Locator): Promise<string> {
    return row.locator('.tree-icon').evaluate((icon) => getComputedStyle(icon).color);
  }

  // the name of the project, in the middle of the navigation bar (a click edits it)
  get projectName(): Locator {
    return this.page.getByRole('navigation').getByRole('button', { name: 'Edit', exact: true });
  }

  get intro(): Locator {
    return this.page.locator('lib-app-intro');
  }

  // the 3D preview, with what it is playing written on top
  get previewPanel(): Locator {
    return this.page.locator('lib-app-preview');
  }

  // the stage drawn by the preview
  get preview(): Locator {
    return this.previewPanel.locator('canvas');
  }

  get masterDimmer(): Locator {
    return this.page.locator('lib-app-master-dimmer').getByRole('textbox').first();
  }

  get timeline(): Locator {
    return this.page.locator('lib-app-timeline');
  }

  // the position of the playback, next to the length of the composition
  get playbackTime(): Locator {
    return this.timeline.getByText(/^\d\d:\d\d\.\d\d\d$/);
  }

  // ---- the preset editor ------------------------------------------------------------

  // the capabilities of the selected fixtures, the first tab of the editor
  get editor(): Locator {
    return this.page.locator('lib-app-fixture-capability');
  }

  // the buttons on the left of the editor: its tabs, the steps, and the name of the preset being edited
  get rail(): Locator {
    return this.page.locator('.tab-rail');
  }

  // the preset being edited, named on the rail with the color it is marked with
  get editTarget(): Locator {
    return this.rail.locator('.edit-target');
  }

  async editTargetColor(): Promise<string> {
    return this.editTarget.locator('i').evaluate((icon) => getComputedStyle(icon).color);
  }

  // the steps of the preset being edited, next to the editor (once they are shown)
  get steps(): Locator {
    return this.page.locator('lib-app-preset-step');
  }

  get dimmerCheckbox(): Locator {
    return this.page.locator('lib-app-fixture-capability-dimmer').getByRole('checkbox');
  }

  get dimmerField(): Locator {
    return this.page.locator('lib-app-fixture-capability-dimmer').getByRole('textbox');
  }

  get colorCheckbox(): Locator {
    return this.page.locator('lib-app-fixture-capability-color').getByRole('checkbox', { name: 'Color', exact: true });
  }

  // the color the editor shows, as a hex code
  get colorField(): Locator {
    return this.page.locator('lib-app-fixture-capability-color').getByRole('textbox');
  }

  // pick a color of the wheel, by its hue in degrees (0 is red, 120 green, 240 blue), almost fully saturated. Returns
  // the hex code the editor shows for it.
  async pickHue(hue: number): Promise<string> {
    const wheel = await this.page.locator('#color-picker-container .iro__wheel__border').boundingBox();
    const radius = (wheel.width / 2) * 0.9;
    const angle = (hue * Math.PI) / 180;

    // the hues run clockwise from the right
    await this.page.mouse.click(
      wheel.x + wheel.width / 2 + radius * Math.cos(angle),
      wheel.y + wheel.height / 2 + radius * Math.sin(angle)
    );
    await expect(this.colorCheckbox).toBeChecked();

    return this.colorField.inputValue();
  }

  // ---- buttons, menus and dialogs -----------------------------------------------------

  // a button which only shows an icon, in the passed part of the designer (e.g. a panel), by the class of its icon
  tool(scope: Locator, icon: string): Locator {
    return scope.locator(`a:has(> i.${icon})`);
  }

  // click a button which only shows an icon, checked by its tooltip, if it has one
  async clickTool(scope: Locator, icon: string, tooltip?: string) {
    const button = this.tool(scope, icon);

    if (tooltip) {
      await button.hover();
      await expect(this.page.getByRole('tooltip', { name: tooltip, exact: true })).toBeVisible();
    }

    await button.click();
  }

  // an entry of a menu of the navigation bar, e.g. menu('Project', 'Save')
  async menu(name: string, entry: string) {
    await this.page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
    await this.page.getByRole('navigation').getByRole('link', { name: entry, exact: true }).click();
  }

  // a dialog by its title (or its text, the warnings and errors have no title)
  dialog(title: string | RegExp): Locator {
    return this.page.getByRole('dialog').filter({ hasText: title });
  }

  // a notification, e.g. after saving, by its title or its message
  toast(text: string | RegExp): Locator {
    return this.page.locator('#toast-container .ngx-toastr').filter({ hasText: text });
  }

  // ---- the fixture pool -----------------------------------------------------------

  get fixturePool(): Locator {
    return this.dialog('Fixture pool');
  }

  // add a fixture of a profile listed in the search of the fixture pool, e.g. 'Test - RGB par'
  async addFromLibrary(profile: string) {
    await this.fixturePool.locator('.list-group-item').filter({ hasText: profile }).getByRole('button').click();
  }

  // ---- the preview -----------------------------------------------------------------

  // how much of the 3D preview is lit in a color (red, green or blue): the share of its pixels where that color is
  // bright and much stronger than the others (more than an orange)
  async previewLitIn(color: 'red' | 'green' | 'blue'): Promise<number> {
    const screenshot = await this.preview.screenshot();
    const channel = ['red', 'green', 'blue'].indexOf(color);

    return this.page.evaluate(
      async ({ png, channel }) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

        let lit = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const value = pixels[i + channel];
          const others = [0, 1, 2].filter((other) => other !== channel).map((other) => pixels[i + other]);
          if (value > 100 && others.every((other) => value > 3 * other)) {
            lit++;
          }
        }

        return lit / (pixels.length / 4);
      },
      { png: screenshot.toString('base64'), channel }
    );
  }
}
