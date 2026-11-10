# Website pictures of the online designer

`website.spec.ts` takes the pictures of the online designer for
[rocketshow.net](https://rocketshow.net/lighting-designer), the way the end-to-end tests run it: the app on the dev
server, its API faked in the page (`../e2e/fake-api.ts`), with the demo project of the documentation screenshots of
Rocket Show opened by a user who is signed in. No request reaches the AI: the spec answers the looks itself, made for the
groups of fixtures the designer sends.

| Picture                 | Where it goes                 | What it shows                                                                                                |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `preview.webp`          | `website/assets/images/`      | the designer with the chorus on the 3D stage (the hero image of the designer page, the home page and others) |
| `docs/designer-ai.webp` | `website/assets/images/docs/` | Design with AI beside the designer, the chorus it designed on the stage (the designer page and the docs)     |

Both are 1600 × 923 pixels, the size the pages reserve for them.

## Taking them

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
