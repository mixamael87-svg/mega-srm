/** e2e seed for the TEST database only: clear tables, one admin, one of our FOPs. */
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/auth/password';

if (!/test/.test(process.env.DATABASE_URL ?? '')) throw new Error('refusing non-test DB');
await prisma.$executeRawUnsafe('TRUNCATE "DocumentVersion", "Document", "InvoiceCounter", "ContactDefault", "ClientFop", "Client", "OurFop", "User" RESTART IDENTITY CASCADE');
await prisma.user.create({ data: { login: 'admin', passwordHash: await hashPassword('adminpass1'), role: 'admin' } });
await prisma.user.create({ data: { login: 'manager', passwordHash: await hashPassword('managerpass1'), role: 'manager' } });
await prisma.ourFop.create({ data: { name: 'ФОП Кузнецов Михайло Володимирович', phone: '067 000 00 00', requisites: 'IBAN UA00 в АТ КБ "ПРИВАТБАНК"\nІПН 1234567890', isDefault: true } });
await prisma.$disconnect();
