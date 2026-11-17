import { prisma } from '../../src/db/prisma';

export async function resetDb() {
  if (!/test/.test(process.env.DATABASE_URL ?? '')) throw new Error('resetDb: not a test database');
  await prisma.$executeRawUnsafe(
    'TRUNCATE "DocumentVersion", "Document", "InvoiceCounter", "ContactDefault", "ClientFop", "Client", "OurFop", "User", "Label" RESTART IDENTITY CASCADE',
  );
  // label sets are seeded by the migration: keep those three, drop the ones tests created
  await prisma.$executeRawUnsafe(`DELETE FROM "LabelSet" WHERE "name" NOT IN ('Загальна', 'ФОП Кузнецов', 'ТОВ Кузкас')`);
  await prisma.$executeRawUnsafe(`INSERT INTO "LabelSet" ("name", "sort") VALUES ('Загальна', 1), ('ФОП Кузнецов', 2), ('ТОВ Кузкас', 3) ON CONFLICT ("name") DO UPDATE SET "sort" = EXCLUDED."sort"`);
}

export async function makeFop(name = 'ФОП Тест', isDefault = false) {
  return prisma.ourFop.create({ data: { name, requisites: `${name}\nІПН 1`, isDefault } });
}

export { prisma };
