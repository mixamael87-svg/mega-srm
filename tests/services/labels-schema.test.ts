import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, resetDb } from '../setup/db';

describe('labels schema', () => {
  beforeEach(() => resetDb());
  afterAll(() => prisma.$disconnect());

  it('has the three seeded sets in order', async () => {
    const sets = await prisma.labelSet.findMany({ orderBy: { sort: 'asc' } });
    expect(sets.map(s => s.name)).toEqual(['Загальна', 'ФОП Кузнецов', 'ТОВ Кузкас']);
  });

  it('resetDb removes test-made sets and labels but keeps the seeded ones', async () => {
    const extra = await prisma.labelSet.create({ data: { name: 'Тестовий', sort: 9 } });
    await prisma.label.create({ data: { setId: extra.id, sku: '0205', text: 'x' } });
    await resetDb();
    expect(await prisma.labelSet.count()).toBe(3);
    expect(await prisma.label.count()).toBe(0);
  });

  it('sku is unique within a set', async () => {
    const set = (await prisma.labelSet.findFirstOrThrow({ where: { name: 'Загальна' } })).id;
    await prisma.label.create({ data: { setId: set, sku: '0205', text: 'a' } });
    await expect(prisma.label.create({ data: { setId: set, sku: '0205', text: 'b' } }))
      .rejects.toSatisfy((e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
  });

  it('deleting the extra label clears the link', async () => {
    const set = (await prisma.labelSet.findFirstOrThrow({ where: { name: 'Загальна' } })).id;
    const part2 = await prisma.label.create({ data: { setId: set, title: 'Частина 2', text: 'інструкція' } });
    const main = await prisma.label.create({ data: { setId: set, sku: '1205', text: 'Арт. 1205', extraLabelId: part2.id } });
    await prisma.label.delete({ where: { id: part2.id } });
    expect((await prisma.label.findUniqueOrThrow({ where: { id: main.id } })).extraLabelId).toBeNull();
  });
});
