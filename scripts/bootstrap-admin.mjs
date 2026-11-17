// On start: if ADMIN_LOGIN/ADMIN_PASSWORD are set and the database has NO users yet, create that admin.
// Never touches existing users, so it is safe to leave the variables set (remove them after first login anyway).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export async function bootstrapAdmin(prisma, env = process.env) {
  const login = env.ADMIN_LOGIN?.trim(), password = env.ADMIN_PASSWORD;
  if (!login || !password) return 'skipped: ADMIN_LOGIN/ADMIN_PASSWORD not set';
  if (password.length < 8) return 'skipped: ADMIN_PASSWORD shorter than 8 characters';
  if ((await prisma.user.count()) > 0) return 'skipped: users already exist';
  await prisma.user.create({ data: { login, passwordHash: await bcrypt.hash(password, 10), role: 'admin' } });
  return `created admin "${login}"`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient();
  try { console.log(`[bootstrap-admin] ${await bootstrapAdmin(prisma)}`); }
  finally { await prisma.$disconnect(); }
}
