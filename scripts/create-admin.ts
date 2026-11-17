/** Create or reset an admin: npx tsx scripts/create-admin.ts <login> <password> */
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/auth/password';

const [login, password] = process.argv.slice(2);
if (!login || !password || password.length < 8) { console.error('Usage: create-admin <login> <password (>= 8 chars)>'); process.exit(1); }
const passwordHash = await hashPassword(password);
await prisma.user.upsert({ where: { login }, create: { login, passwordHash, role: 'admin' }, update: { passwordHash, role: 'admin', active: true } });
console.log(`Admin "${login}" ready`);
await prisma.$disconnect();
