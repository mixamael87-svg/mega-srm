// Create or reset an admin (plain JS, works inside the Docker image): node scripts/create-admin.mjs <login> <password>
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [login, password] = process.argv.slice(2);
if (!login || !password || password.length < 8) { console.error('Usage: node scripts/create-admin.mjs <login> <password (>= 8 chars)>'); process.exit(1); }
const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);
await prisma.user.upsert({ where: { login }, create: { login, passwordHash, role: 'admin' }, update: { passwordHash, role: 'admin', active: true } });
console.log(`Admin "${login}" ready`);
await prisma.$disconnect();
