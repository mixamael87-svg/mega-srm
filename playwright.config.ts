import { defineConfig } from '@playwright/test';

// The browser inherits this env; without a UTF-8 locale Chromium drops Cyrillic download names.
process.env.LANG ||= 'C.UTF-8';
process.env.LC_ALL ||= 'C.UTF-8';

const PORT = 3200;
const env = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://srm:srm@localhost:5432/srm_test',
  SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0001',
  SALESDRIVE_MOCK: '1',
  TZ: 'Europe/Kyiv',
  PORT: String(PORT),
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, acceptDownloads: true, locale: 'uk-UA' },
  globalSetup: './e2e/global-setup.ts',
  webServer: { command: 'npx next build && npx next start', port: PORT, timeout: 240_000, reuseExistingServer: false, env },
});
