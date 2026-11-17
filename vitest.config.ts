import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const env = loadEnv('test', process.cwd(), '');
const TEST_DB = env.TEST_DATABASE_URL ?? 'postgresql://srm:srm@localhost:5432/srm_test';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: { DATABASE_URL: TEST_DB, TZ: 'Europe/Kyiv', SESSION_SECRET: 'test-secret-test-secret-test-secret-123' },
    globalSetup: ['tests/setup/db-global.ts'],
    fileParallelism: false,
  },
});
