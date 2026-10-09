import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests (spec §22): real Angular app + real API + demo database.
 * Prerequisites are in docs/frontend/README.md (backend on :3000 pointed at chlatvei_demo,
 * `node e2e/prepare-demo.mjs` run once). Uses the installed Chrome, so no browser download.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'citizen-mobile', testMatch: /citizen\.spec\.ts/, use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'admin-desktop', testMatch: /admin.*\.spec\.ts/, use: { viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: 'npx ng serve --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
