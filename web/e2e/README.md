# End-to-end tests

The specs in this folder test whole user flows through the designer in a real browser (Chromium, with
[Playwright](https://playwright.dev)): the app as the dev server serves it (`ng serve`), with the designer library
embedded, the 3D preview rendered with WebGL. The unit specs of the library (`ng test designer`) test its parts on
their own, these test that the parts work together the way a user goes through them.

| Spec               | What it covers                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `start.spec.ts`    | the template project opening with all the panels, the intro walking a new user through them and staying closed once closed                     |
| `fixtures.spec.ts` | the fixture pool: finding profiles of the library, patching fixtures, naming and removing them, cancelling                                     |
| `presets.spec.ts`  | adding a preset to a scene, selecting its fixtures, dimming and coloring them, the color the preset is marked with, the preview lit, the steps |
| `timeline.spec.ts` | a scene with a preset on a track of a composition without an audio file, playing, pausing, rewinding, stopping at the end                      |
| `projects.spec.ts` | registering and signing in on the way to saving, saving, opening the saved project again on the next visit and in the project browser, sharing |
| `undo.spec.ts`     | undo and redo with the keyboard and the Edit menu                                                                                              |
| `layout.spec.ts`   | folding panels with the arrows in the gutters and in the View menu, the layouts of the View menu, kept through a reload                        |
| `errors.spec.ts`   | what the user is told when a project can't be opened or saved, or is shared before it has been saved                                           |
| `phone.spec.ts`    | the panels stacked down the page of a phone without the 3D preview, editing a preset and the timeline there, the View menu, the intro          |

## Running them

```shell
cd web
npm ci --legacy-peer-deps
npx playwright install --with-deps chromium   # once
npm run e2e
```

Playwright starts the dev server on port 4300 (`npx ng serve --port 4300`), or uses the one running there already. Run a
single spec with `npm run e2e -- presets`, watch the browser with `npm run e2e -- --headed` or step through a test
with `npm run e2e -- --debug`. A failing test keeps a trace in `e2e/test-results`
(`npx playwright show-trace e2e/test-results/<test>/trace.zip`). CI runs them in the job `e2e` and keeps the HTML
report of a failed run as the artifact `playwright-report`.

## The fake API

The online designer talks to its PHP API (`api/`), which the dev build reaches at `http://localhost:8080/api/`
(`src/environments/environment.ts`). The tests don't need it: `fake-api.ts` answers the requests in the browser
(`context.route`), like the real endpoints do (see `api/*.php` for what they answer):

- `project` serves the template (id 1, which every new project starts from: one preset in one scene, no fixtures) and
  the saved projects to their owner or with their share token, and saves a project for a user who is signed in,
  handing out its id and share token. `projects` lists the projects of the user.
- `fixtures` lists the profiles of the fixture library (the test profiles of the conformance cases in
  `projects/designer/conformance/profiles/test`), `fixture?uuid=` serves one.
- `register` and `login` keep the users and their sessions (the token in the `Authorization` header).

Each test gets a fake API of its own, which already knows the user Jane (`designer.ts`). A test sets up what the API
holds before the designer opens (`addProject`, `patchTemplate` for a template with fixtures, `fail` for an endpoint
which answers with an error), and looks into what it got afterwards (`requests`, `requestsTo('POST project')`,
`savedProject`). The translations and the other assets come from the dev server.

## Writing them

`designer.ts` holds the fixtures of the tests (`api`, `designer`, the options `introSeen`, `signedIn` and
`previewHidden`, which set what the local storage starts with) and the helpers to find the parts of the designer. The
specs find things by what the user sees: the titles of the panels and dialogs, the texts of the menus, labels and
tooltips, in English. Where the app gives no name to go by (the rows of the trees, the buttons which only show an icon),
the helpers find them by their structure, so that the specs don't have to. Each test starts in a fresh browser context,
with an empty local storage like a new visitor, except for what its options put there. Most turn the 3D preview off,
which is the most work for the browser, unless the flow is about what the preview shows.

A test which shows a bug of the app that hasn't been fixed yet is marked with `test.fail()` and a comment saying what
goes wrong: it runs, and is reported as passing as long as it fails the way it does. Once the bug is fixed, Playwright
reports it as failing, and the mark has to go.
