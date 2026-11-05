import { templateProject } from './fake-api';
import { expect, jane, test } from './designer';

// What the user is told when something goes wrong: a project which can't be opened (no permission, a failing server,
// a project of a newer designer), a save which fails, and sharing a project before it has been saved.
test.describe('Errors', () => {
  test.use({ previewHidden: true });

  test("tells the user a project can't be opened without the permission, and starts a new one", async ({ designer, api, page }) => {
    await page.goto('/?id=99');

    const error = designer.dialog('Error');
    await expect(error).toContainText(
      "The project could not be opened, because you don't have the permissions. Ask the project creator to share it over the share-link."
    );
    expect(api.requestsTo('GET project')).toEqual([expect.objectContaining({ params: { id: '99', name: '', token: '' } })]);

    await error.getByRole('button', { name: 'OK' }).click();
    await expect(error).toBeHidden();

    // an empty new project instead, not the template
    await expect(designer.names(designer.panel('Scenes'))).toHaveText(['New Scene', 'New Preset']);
    await expect(designer.projectName).toHaveText('Name');
    await expect(page).not.toHaveURL(/id=99/);
    expect(api.requestsTo('GET project')).toHaveLength(1);
  });

  test('shows what went wrong on the server when a project fails to open', async ({ designer, api, page }) => {
    api.fail('GET project', 500, 'internal');
    await page.goto('/?id=5&token=a-token');

    const error = designer.dialog('Error');
    await expect(error).toContainText('The project could not be opened. Please reach out to our support under the menu help, if needed.');
    await expect(error).toContainText('(internal)');
  });

  test('refuses a project saved by a newer version of the designer', async ({ designer, api, page }) => {
    const id = api.addProject(jane.email, { ...templateProject(), name: 'From the future', version: 11 });
    await page.goto(`/?id=${id}&token=share-token-${id}`);

    const error = designer.dialog('Error');
    await expect(error).toContainText('The project could not be opened.');
    await expect(error).toContainText(
      '(The project version 11 is created with a newer version of the designer. Please update your Rocket Show version to open this project.)'
    );
  });

  test('asks to save a project before sharing it', async ({ designer, page }) => {
    await designer.open();
    await page.getByRole('navigation').getByText('Share').click();

    const error = designer.dialog('Error');
    await expect(error).toContainText('Please save the project before sharing it.');
    await error.getByRole('button', { name: 'OK' }).click();
    await expect(error).toBeHidden();
    await expect(designer.dialog('Share project')).toBeHidden();
  });

  test.describe('signed in', () => {
    test.use({ signedIn: true });

    test("tells the user when the project can't be saved", async ({ designer, api }) => {
      api.fail('POST project', 500, 'internal');
      await designer.open();

      await designer.menu('Project', 'Save');
      const save = designer.dialog('Save project');
      await save.getByRole('textbox').fill('My Show');
      await save.getByRole('button', { name: 'OK' }).click();

      await expect(designer.toast('Error on saving project')).toContainText(
        'The project could not be saved. Please reach out to our support under the menu help, if needed. (internal)'
      );

      // and it isn't the one opened on the next visit
      await designer.open('/');
      expect(api.requestsTo('GET project').at(-1).params).toEqual({ id: '1', name: '', token: '' });
    });
  });
});
