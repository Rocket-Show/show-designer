# Website pictures of the online designer

`website.spec.ts` takes the pictures of the online designer for [rocketshow.net](https://rocketshow.net/lighting-designer)
and its documentation, the way the end-to-end tests run it: the app on the dev server, its API faked in the page
(`../e2e/fake-api.ts`), with the demo project of the documentation screenshots of Rocket Show opened by a user who is
signed in. No request reaches the AI: the spec answers the looks itself, made for the groups of fixtures the designer
sends, and the profile of the AI with its review. For the fixture library, the fake library holds versions of the
profiles of the demo project, with where they come from and what is known about them.

| Picture                           | Where it goes                 | What it shows                                                                                                                                         |
| --------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/designer-ai.webp`           | `website/assets/images/docs/` | Design with AI beside the designer, the chorus it designed on the stage (the designer page and the docs)                                              |
| `docs/designer-fixture-pool.webp` | `website/assets/images/docs/` | The fixture pool: the profiles of the library with their versions, the fixtures with their addresses, one marked with a better version, the DMX patch |
| `docs/designer-add-profile.webp`  | `website/assets/images/docs/` | The ways to add a profile the library doesn't have, below the list of the profiles: with AI, from a file, in the editor of the Open Fixture Library   |
| `docs/designer-ai-fixture.webp`   | `website/assets/images/docs/` | Create profile with AI: the review of a profile made from the manual, channel by channel with the page and the quote                                  |

`designer-ai.webp` is 1600 × 923 pixels, the size the pages reserve for it. The pictures of the fixture library are
taken at twice the pixels, of the dialog or the part of it they show: the fixture pool 2720 × 2158, the ways to add a
profile 1352 × 1110 and the review of the AI 1600 × 1290. The main picture of the designer on the website is the one of
the Rocket Show docs (`docs/designer.webp`, taken by `docs/screenshots/capture.js` in the rocketshow repository), with
the whole of the preset editor in view.

## Taking it

With the rocketshow and spark repositories checked out next to this one:

```shell
cd web
npm ci --legacy-peer-deps
npx playwright test -c screenshots
```

The demo project is read from `../rocketshow/docs/screenshots/demo-data/designer/project-summer-tour-2026.json` and the
pictures are written to `../spark/website/assets/images`. Set `DEMO_PROJECT` and `OUT_DIR` for other places. Playwright
starts the dev server on port 4300 like for the end-to-end tests, or uses the one running there. It runs the Google
Chrome installed on the computer (`PW_CHANNEL=chromium` for the Chromium of Playwright instead).
