import { defineConfig, devices } from '@playwright/test';

// The specs of whole user flows through the designer, in the app as the dev server serves it, with a fake of its API
// (see README.md)
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // a test which only passes on its retry is reported as flaky
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4300',
    // the panels of the designer are laid out for larger screens
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4300',
    cwd: '..',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env.CI,
    // the first build of the app takes a while
    timeout: 300_000,
  },
});
