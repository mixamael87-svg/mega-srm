import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { createOurFopService } from '../../src/services/ourFops';
import { nextInvoiceNumber } from '../../src/services/numbering';

const nov = new Date(2026, 10, 4);
const next = (fopId: number) => prisma.$transaction(tx => nextInvoiceNumber(tx, fopId, nov));

describe('our FOPs: delete or archive', () => {
  const svc = createOurFopService(prisma);
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  async function withDocument(fopId: number) {
    const u = await prisma.user.create({ data: { login: `u${fopId}`, passwordHash: 'x' } });
    await prisma.document.create({ data: { type: 'RAHUNOK', number: await next(fopId), date: nov, fopId, sdOrderId: 1000 + fopId, createdById: u.id } });
  }

  it('without documents → deleted for good', async () => {
    const f = await makeFop('ФОП Помилковий');
    expect(await svc.usage(f.id)).toEqual({ documents: 0 });
    expect(await svc.remove(f.id)).toEqual({ deleted: true, archived: false });
    expect(await prisma.ourFop.findUnique({ where: { id: f.id } })).toBeNull();
  });

  it('with documents → archived (not default), counter kept; restore continues numbering', async () => {
    const f = await makeFop('ФОП Кастирін', true);
    await withDocument(f.id);
    await next(f.id); // №2 issued too
    expect(await svc.usage(f.id)).toEqual({ documents: 1 });
    expect(await svc.remove(f.id)).toEqual({ deleted: false, archived: true });
    expect(await prisma.ourFop.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ archived: true, isDefault: false });
    expect(await prisma.document.count({ where: { fopId: f.id } })).toBe(1);
    await svc.restore(f.id);
    expect((await prisma.ourFop.findUniqueOrThrow({ where: { id: f.id } })).archived).toBe(false);
    expect(await next(f.id)).toBe(3);
  });

  it('revaluation documents count too: such a FOP is archived, not deleted', async () => {
    const f = await makeFop('ФОП З переоцінкою');
    const u = await prisma.user.create({ data: { login: 'r', passwordHash: 'x' } });
    await prisma.reportDocument.create({ data: { kind: 'PEREOTSINKA', number: 1, date: nov, counterFopId: f.id, createdById: u.id, headerJson: {}, linesJson: [], totalsJson: {} } });
    expect(await svc.usage(f.id)).toEqual({ documents: 1 });
    expect(await svc.remove(f.id)).toEqual({ deleted: false, archived: true });
  });

  it('unknown id → 404', async () => {
    await expect(svc.usage(99999)).rejects.toMatchObject({ status: 404 });
    await expect(svc.remove(99999)).rejects.toMatchObject({ status: 404 });
    await expect(svc.restore(99999)).rejects.toMatchObject({ status: 404 });
  });
});
