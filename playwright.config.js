import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests',
  workers: process.env.CI ? 1 : 2,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: baseURL,
    env: { PORT: '4174', APPROVAL_DB: ':memory:', APPROVAL_LEGACY_BUG: '0' },
  },
});
