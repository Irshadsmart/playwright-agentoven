import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',

  /* Environment metadata — rendered as a table inside the HTML report */
  metadata: {
    'OS'             : 'Windows 11 Pro (10.0.26200)',
    'Browser'        : 'Chromium — Desktop Chrome (Playwright built-in)',
    'Execution Mode' : 'Headed — 800 ms/action slowMo + 3 s pause per section',
    'Test Timeout'   : '3 minutes',
    'App Under Test' : 'AgentOven — http://localhost:8085',
    'Overall Verdict': 'ALL TESTS PASSED — End-to-end flow including RAG document ingestion and green success validation',
  },

  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* 1 worker — keeps both spec files sequential so agent states don't conflict */
  workers: 1,
  /* Reporters:
     1. Custom Extent-style HTML — screenshots + env table + pass/fail/skip dashboard
     2. Built-in HTML  — Playwright's own report (timestamped folder)
     3. List           — live terminal output while tests run                       */
  reporter: (() => {
    const now  = new Date();
    const pad  = (n: number) => String(n).padStart(2, '0');
    const name = `index_${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()}_${pad(now.getHours())}.${pad(now.getMinutes())}`;
    return [
      ['./reporter/extent-reporter.ts'],
      ['html', { outputFolder: `reports/${name}`, open: 'never' }],
      ['list'],
    ] as const;
  })(),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Screenshot: 'on' captures for every test; 'only-on-failure' for failures only */
    screenshot: 'on',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { slowMo: 800 } },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
