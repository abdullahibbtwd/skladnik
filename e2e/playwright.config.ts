import { defineConfig } from '@playwright/test';

const baseURL = process.env.GUIDE_BASE_URL ?? 'http://localhost:5176';

export default defineConfig({
  testDir: './guide-screenshots',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
