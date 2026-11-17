import { execSync } from 'node:child_process';
import { loadEnv } from 'vite';

/** Apply migrations to the TEST database once per run (globalSetup does not see test.env). */
export default function setup() {
  const env = loadEnv('test', process.cwd(), '');
  const url = env.TEST_DATABASE_URL ?? 'postgresql://srm:srm@localhost:5432/srm_test';
  if (!/test/.test(url)) throw new Error(`Refusing to migrate a non-test database: ${url}`);
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
