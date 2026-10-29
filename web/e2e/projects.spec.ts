import { templateProject } from './fake-api';
import { Designer, expect, jane, test } from './designer';

// a project Jane has saved before, with a scene of its own
function savedShow(name: string, sceneName: string): any {
  const project = templateProject();
  project.name = name;
  project.scenes[0].name = sceneName;
  return project;
}

// Saving a project needs an account: the designer asks the user to register or to sign in on the way, and saves the
// project to the API. It opens the project saved last on the next visit again. Saved projects are opened from the
// project browser, and shared with a link which opens them for anyone.
test.describe('Saving and opening projects', () => {
  test.use({ previewHidden: true });

  test('asks a new user to register before saving, then saves the project', async ({ designer, api, page }) => {
    await designer.open();
    await designer.masterDimmer.fill('40');
    await designer.menu('Project', 'Save');

    const register = designer.dialog('Register');
    await expect(register.getByRole('alert')).toHaveText('Please sign in to proceed.');
    await register.getByLabel('Username', { exact: true }).fill('Max');
    await register.getByLabel('Email', { exact: true }).fill('max@example.com');
    // the password is sent in the address: the characters which mean something there have to arrive as they are
    await register.getByLabel('Password', { exact: true }).fill('my+secret&1');
    await register.getByLabel('Password (repeat)').fill('my+secret&1');
    await register.getByRole('button', { name: 'Register now' }).click();
    await expect(register).toBeHidden();

    // signed in, the project gets a name on its first save
    const save = designer.dialog('Save project');
    await expect(save.getByRole('textbox')).toHaveValue('New Project');
    await save.getByRole('textbox').fill('My Show');
    await save.getByRole('button', { name: 'OK' }).click();
    await expect(designer.toast('The project has been saved.')).toBeVisible();

    expect(api.users).toContainEqual({ email: 'max@example.com', username: 'Max', password: 'my+secret&1', newsletter: false });
    const [saved] = api.requestsTo('POST project');
    expect(api.sessions.get(saved.authorization)).toBe('max@example.com');
    expect(saved.body.id).toBeUndefined();
    expect(saved.body).toMatchObject({
      name: 'My Show',
      masterDimmerValue: 0.4,
      presets: [expect.objectContaining({ name: 'New Preset' })],
      scenes: [expect.objectContaining({ name: 'New Scene' })],
    });

    // the address leads to the saved project now
    await expect(page).toHaveURL(/\?id=2&token=share-token-2$/);
    await expect(designer.projectName).toHaveText('My Show');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Max' })).toBeVisible();
  });

  test('signs a user in with an account and out again', async ({ designer, api, page }) => {
    await designer.open();
    const navigation = page.getByRole('navigation');
    await navigation.getByText('Sign in').click();

    // an address which is registered already
    const register = designer.dialog('Register');
    await register.getByLabel('Username', { exact: true }).fill('Jane');
    await register.getByLabel('Email', { exact: true }).fill(jane.email);
    await register.getByLabel('Password', { exact: true }).fill('another');
    await register.getByLabel('Password (repeat)').fill('another');
    await register.getByRole('button', { name: 'Register now' }).click();
    await expect(register.getByRole('alert')).toHaveText(
      'This email address already exists. Please reach out to our support under the menu help, if needed.'
    );

    await register.getByText('You already have an account?').click();
    const login = designer.dialog('Login');
    await login.getByLabel('Email', { exact: true }).fill(jane.email);
    await login.getByLabel('Password', { exact: true }).fill('wrong');
    await login.getByRole('button', { name: 'Login' }).click();
    await expect(login.getByRole('alert')).toHaveText(
      'The credentials are wrong. Please reach out to our support under the menu help, if needed.'
    );

    // the enter key logs in as well
    await login.getByLabel('Password', { exact: true }).fill(jane.password);
    await page.keyboard.press('Enter');
    await expect(login).toBeHidden();
    await expect(navigation.getByRole('link', { name: 'Jane' })).toBeVisible();
    expect(api.requestsTo('POST login').map((request) => request.params.password)).toEqual(['wrong', jane.password]);

    await designer.menu('Jane', 'Log out');
    await expect(navigation.getByText('Sign in')).toBeVisible();
  });

  test.describe('signed in', () => {
    test.use({ signedIn: true });

    test('opens the saved project again on the next visit', async ({ designer, api }) => {
      await designer.open();
      await designer.masterDimmer.fill('40');
      await designer.menu('Project', 'Save');
      const save = designer.dialog('Save project');
      await save.getByRole('textbox').fill('My Show');
      await save.getByRole('button', { name: 'OK' }).click();
      await expect(designer.toast('The project has been saved.')).toBeVisible();

      // the address of the project
      await designer.reload();
      await expect(designer.projectName).toHaveText('My Show');
      await expect(designer.masterDimmer).toHaveValue('40');

      // without it, the designer opens the project saved last
      await designer.open('/');
      await expect(designer.projectName).toHaveText('My Show');
      expect(api.requestsTo('GET project').at(-1)).toMatchObject({
        params: { id: '2', name: 'My Show', token: '' },
        authorization: 'session-of-jane',
      });

      // saving it again stores it under its id, without asking for a name
      await designer.masterDimmer.fill('60');
      await designer.menu('Project', 'Save');
      await expect(designer.toast('The project has been saved.')).toBeVisible();
      await expect(designer.dialog('Save project')).toBeHidden();
      expect(api.savedProject(2)).toMatchObject({ id: 2, name: 'My Show', masterDimmerValue: 0.6 });
      expect(api.projects.size).toBe(2);
    });

    test('opens a project from the project browser', async ({ designer, api }) => {
      api.addProject(jane.email, savedShow('Rock night', 'Encore'));
      api.addProject(jane.email, savedShow('Acoustic set', 'Unplugged'));
      api.addProject('someone@example.com', savedShow('Not mine', 'Elsewhere'));
      await designer.open();

      await designer.menu('Project', 'Open');
      await designer.dialog('Unsaved changes will be lost. Do you really want to proceed?').getByRole('button', { name: 'OK' }).click();

      // Jane's projects, by their names
      const browser = designer.dialog('Projects');
      await expect(browser.getByRole('link')).toHaveText(['Acoustic set', 'Rock night']);
      await browser.getByRole('link', { name: 'Rock night' }).click();
      await expect(browser).toBeHidden();
      await expect(designer.projectName).toHaveText('Rock night');
      await expect(designer.names(designer.panel('Scenes'))).toHaveText(['Encore', 'New Preset']);

      // and it is the one opened on the next visit
      await designer.open('/');
      await expect(designer.projectName).toHaveText('Rock night');
    });

    test('shares a saved project with a link which opens it for anyone', async ({ designer, api, page, context, browser, baseURL }) => {
      const id = api.addProject(jane.email, savedShow('Rock night', 'Encore'));
      await designer.open('/?id=' + id);
      await expect(designer.projectName).toHaveText('Rock night');

      await page.getByRole('navigation').getByText('Share').click();
      const share = designer.dialog('Share project');
      const link = await share.getByRole('textbox').inputValue();
      expect(link).toBe(baseURL + '/designer/app?id=' + id + '&token=share-token-' + id);

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await share.getByRole('button', { name: 'Copy link' }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await share.getByRole('button', { name: 'OK' }).click();
      await expect(share).toBeHidden();

      // a friend who isn't signed in opens the link
      const friendsBrowser = await browser.newContext({
        storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'showIntro', value: 'false' }] }] },
      });
      await api.attach(friendsBrowser);
      const friend = new Designer(await friendsBrowser.newPage(), api);
      await friend.open(link);
      await expect(friend.projectName).toHaveText('Rock night');
      await expect(friend.names(friend.panel('Scenes'))).toHaveText(['Encore', 'New Preset']);
      expect(api.requestsTo('GET project').at(-1)).toMatchObject({
        params: { id: String(id), name: '', token: 'share-token-' + id },
        authorization: undefined,
      });
      await friendsBrowser.close();
    });

    // the template has no address of its own: a reload starts a new project from it again, instead of opening the
    // template itself, which saving would have posted as project 1 (refused, or for an admin overwriting the template)
    test('saves a project started from the template as a new one, also after a reload', async ({ designer, api, page }) => {
      await designer.open();
      await expect(page).not.toHaveURL(/id=1/);
      await designer.reload();

      await designer.menu('Project', 'Save');
      const save = designer.dialog('Save project');
      await save.getByRole('textbox').fill('My Show');
      await save.getByRole('button', { name: 'OK' }).click();
      await expect(designer.toast(/The project (has been|could not be) saved/)).toBeVisible();

      expect(api.requestsTo('POST project').at(-1).body.id).toBeUndefined();
      await expect(designer.toast('The project has been saved.')).toBeVisible();
    });
  });
});
