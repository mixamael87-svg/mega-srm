import { execSync } from 'node:child_process';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://srm:srm@localhost:5432/srm_test';
  if (!/test/.test(url)) throw new Error('refusing non-test DB');
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx e2e/seed.ts', { env, stdio: 'pipe' });
}
