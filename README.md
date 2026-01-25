# Rocket Show Designer

This project allows editing lighting shows for Rocket Show as a web application in the browser.

## Fixture profile library

The Rocket Show Designer relies on the Open Fixture Library (OFL). There is currently no plugin, which maps the OFL profiles to the Rocket Show format. Currently, we rely on the OFL JSON-format.

Use this repo to update the database with the newest fixtures:
https://github.com/moritzvieli/show-designer-ofl-import

## Example project for the online designer

1. Prepare a project as desired
2. Export it
3. Remove the name and the id attributes
4. Store it as project with ID 1 in the database

## Development

- Start the designer with  `cd web && npm install && ng serve`
- Access the app in your browser with `localhost:4200`
- Some functionality requires a server (e.g. loading/saving projects, handling audio files). You can start a rocket show server (see https://github.com/moritzvieli/rocketshow) and point environment.ts's localBackend to `http://localhost:8080`
- Prettier and precommit hook according to: https://medium.com/@victormejia/setting-up-prettier-in-an-angular-cli-project-2f50c3b9a537

If the linter fails, you can check and try to automatically fix it with `ng lint --fix`.

## Build & publish as NPM package

Use ignore-scripts: https://stackoverflow.com/a/66383890/1925327

```
cd projects/designer
npm version minor
cd ../..
npm run publish --ignore-scripts
```

Tag the version correspondingly.

## Build online version for production

Activate the online designer-part in web/src/app/app.component.html first.

```
cd web
ng build --configuration production --base-href web/designer/app/
```

Take the content of the folder dist/show-designer and upload it to the web /designer/app (after emptying the folder there first).
