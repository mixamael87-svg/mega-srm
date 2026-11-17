import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma, resetDb, makeFop } from '../setup/db';
import { createDocumentService, parseDocDate } from '../../src/services/documents';
import type { SalesDriveClient } from '../../src/salesdrive/client';
import type { SdOrder, SdProduct } from '../../src/domain/types';

const mkOrder = (id: number, over: Partial<SdOrder> = {}): SdOrder => ({
  id, orderTime: '2026-11-12 10:00:00', contactId: 500, contactName: 'Палій Анна', organizationId: null, discountAmount: 0,
  paymentAmount: 24 * 45 + 2 * 30,
  lines: [
    { productId: 20, parameter: 'id_20', sku: '0001', name: 'Ніблер (Мікс) (0001)', amount: 24, price: 45, discount: 0, percentDiscount: 0 },
    { productId: 30, parameter: 'p30', sku: '0100', name: 'Пустушка', amount: 2, price: 30, discount: 0, percentDiscount: 0 },
  ],
  ...over,
});
const catalog: SdProduct[] = [
  { id: 'id_20', sku: '0001', name: 'Ніблер (Мікс) (0001)' },
  { id: 'v1', sku: '0001', name: 'Ніблер (рожевий)', inStock: 10 },
  { id: 'v2', sku: '0001', name: 'Ніблер (блакитний)', inStock: 0 },
];
function fakeSd(orders: Record<number, SdOrder>): SalesDriveClient {
  return {
    getOrder: async (id: number) => orders[id] ?? null,
    listProductsBySku: async (sku: string) => catalog.filter(p => p.sku === sku),
    listOrganizations: async () => [{ id: 7, title: 'ФОП Ольховский', egrpou: '1', iban: 'UA1' }],
  };
}

describe('document service', () => {
  let fopId: number, userId: number, svc: ReturnType<typeof createDocumentService>;
  const base = { fopId: 0, date: parseDocDate('2026-11-12'), splits: [], userId: 0 };

  beforeEach(async () => {
    await resetDb();
    fopId = (await makeFop('ФОП Кузнецов', true)).id;
    userId = (await prisma.user.create({ data: { login: 'm', passwordHash: 'x' } })).id;
    await prisma.clientFop.create({ data: { sdContactId: 500, name: 'ФОП Палій Анна', requisites: 'ІПН 0987654321' } });
    svc = createDocumentService({ prisma, sd: fakeSd({ 54969: mkOrder(54969), 54970: mkOrder(54970), 54971: mkOrder(54971, { contactId: 999 }), 54972: mkOrder(54972, { paymentAmount: 1 }) }) });
    Object.assign(base, { fopId, userId });
  });
  afterAll(() => prisma.$disconnect());

  it('nakladna: number = order id; regenerate keeps document & number, adds a version', async () => {
    const a = await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 });
    expect(a.number).toBe(54969);
    expect(a.filename).toBe('Видаткова_накладна_54969_2026-11-12.xlsx');
    const b = await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969, splits: [{ lineIndex: 0, parts: [{ variantId: 'v1', qty: 20 }, { variantId: 'v2', qty: 4 }] }] });
    expect(b.documentId).toBe(a.documentId);
    expect(b.number).toBe(54969);
    expect(await prisma.documentVersion.count({ where: { documentId: a.documentId } })).toBe(2);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b.file as any);
    const texts: string[] = []; wb.worksheets[0]!.eachRow(r => r.eachCell(c => { texts.push(String(c.text)); }));
    expect(texts).toContain('Ніблер (рожевий)');
    expect(texts.some(t => t.startsWith('ФОП Кузнецов\n') && t.includes('ІПН 1'))).toBe(true);
    expect(texts.some(t => t.startsWith('ФОП Палій Анна\n') && t.includes('ІПН 0987654321'))).toBe(true);
  });

  it('rahunok: monthly counter; regenerate keeps number; next order gets next number', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    expect(a.number).toBe(1);
    expect(a.filename).toBe('Рахунок-фактура_1_2026-11-12.xlsx');
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 })).number).toBe(1);
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970 })).number).toBe(2);
  });

  it('concurrent first generation of the same rahunok → one document, no gap', async () => {
    const rs = await Promise.all([1, 2, 3].map(() => svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 })));
    expect(new Set(rs.map(r => r.documentId)).size).toBe(1);
    expect(rs.map(r => r.number)).toEqual([1, 1, 1]);
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970 })).number).toBe(2);
  });

  it('rahunok regeneration cannot move its number to another FOP or month (would duplicate numbers)', async () => {
    const other = (await makeFop('ФОП Кастирін')).id;
    await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    await expect(svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969, fopId: other })).rejects.toMatchObject({ code: 'RAHUNOK_LOCKED', status: 409 });
    await expect(svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969, date: parseDocDate('2026-12-01') })).rejects.toMatchObject({ code: 'RAHUNOK_LOCKED' });
    // same month, other day — allowed, number kept
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969, date: parseDocDate('2026-11-30') })).number).toBe(1);
    // the other FOP's own counter still starts at 1 without clashing
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970, fopId: other })).number).toBe(1);
    // nakladna may change supplier freely (its number is the order id)
    await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 });
    expect((await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969, fopId: other })).number).toBe(54969);
  });

  it('missing recipient requisites → RECIPIENT_REQUISITES_MISSING', async () => {
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54971 })).rejects.toMatchObject({ code: 'RECIPIENT_REQUISITES_MISSING' });
  });

  it('order not found → ORDER_NOT_FOUND (404)', async () => {
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 1 })).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('annulled document cannot be regenerated; its number stays taken', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    await svc.annulDocument(a.documentId, userId);
    await expect(svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 })).rejects.toMatchObject({ code: 'DOCUMENT_ANNULLED' });
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970 })).number).toBe(2);
  });

  it('DocumentBuildError propagates with its code', async () => {
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969, splits: [{ lineIndex: 0, parts: [{ variantId: 'v1', qty: 5 }] }] }))
      .rejects.toMatchObject({ code: 'SPLIT_SUM_MISMATCH' });
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54972 })).rejects.toMatchObject({ code: 'TOTAL_MISMATCH' });
    expect(await prisma.document.count()).toBe(0);
  });

  it('document date is stored as the calendar date (no TZ shift) and re-download works', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969, date: parseDocDate('2026-12-01') });
    expect(a.number).toBe(1);
    const [row] = await svc.listDocuments();
    expect(row).toMatchObject({ number: 1, date: '2026-12-01', type: 'RAHUNOK', sdOrderId: 54969, clientName: 'ФОП Палій Анна', status: 'ACTIVE' });
    const f = await svc.downloadDocument(a.documentId);
    expect(f.filename).toBe('Рахунок-фактура_1_2026-12-01.xlsx');
    expect(f.file.length).toBeGreaterThan(1000);
  });

  it('parseDocDate rejects garbage', () => {
    expect(() => parseDocDate('2026-13-01')).toThrow();
    expect(() => parseDocDate('abc')).toThrow();
    expect(parseDocDate('2026-02-28').getDate()).toBe(28);
  });
});
