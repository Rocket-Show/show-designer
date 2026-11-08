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

- Start the designer with `cd web && npm install && ng serve`
- Access the app in your browser with `localhost:4200`
- Some functionality requires a server (e.g. loading/saving projects, handling audio files). You can start a rocket show server (see https://github.com/moritzvieli/rocketshow) and point environment.ts's localBackend to `http://localhost:8080`
- To test against a real Rocket Show device, start the designer with `cd web && ROCKETSHOW_PASSWORD=<admin password> npm run start:device`. The dev server forwards `/api` to `http://rocketshow.local` and logs in with the admin password of the device, because the designer has no login of its own (see `web/proxy.device.mjs`). Set `ROCKETSHOW_DEVICE` for another device, e.g. `ROCKETSHOW_DEVICE=http://192.168.1.64`
- Prettier and precommit hook according to: https://medium.com/@victormejia/setting-up-prettier-in-an-angular-cli-project-2f50c3b9a537

If the linter fails, you can check and try to automatically fix it with `ng lint --fix`.

## Tests

The unit tests of the designer library (Karma and Jasmine, `*.spec.ts`) run in CI on every push
(`.github/workflows/ci.yml`), followed by a build of the library like for publishing. Several of them mirror the tests
of the engine in Rocket Show (e.g. the effect curves and the intensity of presets), so a show looks the same in the
designer and on stage. They test behaviour: the generated specs, which only checked that a component or service could
be created, were removed.

Run them locally (`CHROME_BIN` if Karma doesn't find Chrome or Chromium by itself):

```shell
cd web
npm ci --legacy-peer-deps
npx ng test designer --watch=false --browsers=ChromeHeadlessCI
```

### Coverage

CI runs the specs with `--code-coverage`, shows the coverage in the summary of the run and keeps the report as an
artifact (`coverage-report`). The coverage is measured against every file of the library: a spec builds the
`DesignerModule`, which loads all of its components, also the ones no other spec touches. The run fails below a
minimum (`check` in `projects/designer/karma.conf.js`), two percent below what the specs reach, so that a change with
fewer specs than the rest still passes. The minimum only goes up: after a run with coverage, `npm run coverage:ratchet`
raises it to two percent below what the specs reach, and CI warns when it is behind that by more than a percent.
Locally, the report is written to `web/coverage/designer` (`index.html`):

```shell
npx ng test designer --watch=false --browsers=ChromeHeadlessCI --code-coverage
npm run coverage:ratchet
```

### Parity with Rocket Show

Rocket Show plays a project with an engine of its own (Java), which has to light the stage exactly like the preview of
the designer. Both run the conformance cases of `web/projects/designer/conformance` (see its README): curves, steps,
fades, the fixture library and whole projects played on the timeline, as a preset and as scenes, recorded from the
designer (`npm run conformance:record`) and compared exactly. Where the two could read a project differently (values
which are null, missing or not whole, default values, numbers and colors of the fixture library, pixel groups),
`services/parity.spec.ts` and the cases of `PreviewService like Rocket Show plays it` in
`services/preview.service.spec.ts` check the same cases as `DesignerParityTest` and `DesignerDmxTest` in Rocket Show. A
change to how a project is played changes both sides, with the same cases. That includes the pixel effects: their
patterns, palettes, texts and images, across the stage, and how they follow the audio. Only how the audio is measured
differs (the designer analyzes the audio file, Rocket Show the audio while it plays), so the cases bring the frames of an
analysis along.

### Whole flows in the browser

The end-to-end tests in `web/e2e` (Playwright) go through the designer like a user: adding fixtures, presets, scenes,
compositions and pixel effects, playing them, saving, opening and sharing projects, undo and the layout. The app runs on
the dev server, its API is faked in the page (see `web/e2e/README.md`):

```shell
cd web
npm run e2e
```

### The API

The PHP API of the online designer, its database schema and its tests live in the
[spark](https://github.com/Rocket-Show/spark) repository (`show-designer-api/`, `show-designer-database/` and
`show-designer-api-test/`).

### The AI looks

With `[aiLooks]="true"` (the online designer), the scenes panel offers to design scenes with AI (the magic wand). Claude
designs presets and scenes for the fixtures of the project through the `ai-looks` endpoint of the API (see the README of
the spark repository for its settings and the API key), so the user has to be logged in, like for saving: a visitor is
asked to log in or to register first. A Rocket Show device has no such endpoint and leaves it off.

- `models/ai-rig.ts` describes the fixtures in groups (a folder of the fixture pool, or each model and place on the
  stage) with what they can do.
- `models/ai-looks-compiler.ts` turns the looks Claude answers into presets and scenes with the attributes of the
  designer: dimmers, colors and zooms, fanned out or as gradients, color sequences in steps following the beat, moving
  heads aimed at a spot and fanned, movements, dimmer curves, pixel effects and the strobe in its effect, as fast on
  every model as asked (`AiLooksService.getStrobeValues`).
- `ai/ai-looks` is the dialog: what the user asks for (the output, colors or a palette, the mood, the energy, the
  tempo, the movement, the contrast, the strobe), the scenes Claude designed, changing them, and adding them to the
  project in folders named after them, as one step to undo.

## Build & publish as NPM package

```shell
npm login
cd web
cd projects/designer
npm version minor
cd ../..
npm run publish
```

Tag the version correspondingly.

## Build online version for production

```
cd web
ng build --configuration production --base-href /designer/app/
```

Take the content of the folder dist/show-designer/browser and upload it to the web /designer/app (after emptying the folder there first).
