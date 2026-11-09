import { defineConfig } from '@playwright/test';
import config from './playwright.config.js';

const baseURL = 'http://127.0.0.1:4175';

export default defineConfig({
  ...config,
  outputDir: 'test-results/legacy',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-legacy', open: 'never' }]],
  use: { ...config.use, baseURL },
  webServer: {
    ...config.webServer,
    url: baseURL,
    env: { ...config.webServer.env, PORT: '4175', APPROVAL_LEGACY_BUG: '1' },
  },
});
