import { defineConfig, devices } from '@playwright/test';

// The pictures of the online designer on the website, taken like the end-to-end tests run (see README.md)
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    // the Google Chrome installed on the computer, which needs no download of a browser of Playwright
    channel: process.env.PW_CHANNEL || 'chrome',
    baseURL: 'http://localhost:4300',
    trace: 'off',
    // the 3D preview, rendered without a graphics card
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    // with the API where the end-to-end tests fake it (src/environments/environment.e2e.ts)
    command: 'npx ng serve --port 4300 --configuration e2e',
    cwd: '..',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
