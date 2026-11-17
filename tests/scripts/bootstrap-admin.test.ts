import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../setup/db';
// @ts-expect-error plain JS module
import { bootstrapAdmin } from '../../scripts/bootstrap-admin.mjs';
import { verifyPassword } from '../../src/auth/password';

describe('bootstrapAdmin', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('creates the first admin only when the DB has no users', async () => {
    expect(await bootstrapAdmin(prisma, { ADMIN_LOGIN: 'owner', ADMIN_PASSWORD: 'secret-pass-1' })).toBe('created admin "owner"');
    const u = await prisma.user.findUniqueOrThrow({ where: { login: 'owner' } });
    expect(u.role).toBe('admin');
    expect(await verifyPassword('secret-pass-1', u.passwordHash)).toBe(true);
    expect(await bootstrapAdmin(prisma, { ADMIN_LOGIN: 'owner', ADMIN_PASSWORD: 'other-pass-2' })).toBe('skipped: users already exist');
    expect(await verifyPassword('secret-pass-1', (await prisma.user.findUniqueOrThrow({ where: { login: 'owner' } })).passwordHash)).toBe(true);
  });

  it('skips without variables or with a short password', async () => {
    expect(await bootstrapAdmin(prisma, {})).toMatch(/^skipped/);
    expect(await bootstrapAdmin(prisma, { ADMIN_LOGIN: 'a', ADMIN_PASSWORD: 'short' })).toMatch(/^skipped/);
    expect(await prisma.user.count()).toBe(0);
  });
});
