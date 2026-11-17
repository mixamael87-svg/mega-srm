import { prisma } from '../../src/db/prisma';

export async function resetDb() {
  if (!/test/.test(process.env.DATABASE_URL ?? '')) throw new Error('resetDb: not a test database');
  await prisma.$executeRawUnsafe(
    'TRUNCATE "DocumentVersion", "Document", "InvoiceCounter", "ContactDefault", "ClientFop", "Client", "OurFop", "User" RESTART IDENTITY CASCADE',
  );
}

export async function makeFop(name = 'ФОП Тест', isDefault = false) {
  return prisma.ourFop.create({ data: { name, requisites: `${name}\nІПН 1`, isDefault } });
}

export { prisma };
