import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma, resetDb, makeFop } from '../setup/db';
import { createDocumentService, parseDocDate, partyText } from '../../src/services/documents';
import { createClientService } from '../../src/services/clients';
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
  let fopId: number, userId: number, recipientFopId: number, svc: ReturnType<typeof createDocumentService>;
  const base = { fopId: 0, recipientFopId: 0, date: parseDocDate('2026-11-12'), splits: [], userId: 0 };
  const clients = createClientService(prisma);

  beforeEach(async () => {
    await resetDb();
    fopId = (await makeFop('ФОП Кузнецов', true)).id;
    userId = (await prisma.user.create({ data: { login: 'm', passwordHash: 'x' } })).id;
    recipientFopId = (await clients.createClient({ name: 'Палій', fop: { name: 'ФОП Палій Анна', requisites: 'ІПН 0987654321' } })).fops[0]!.id;
    svc = createDocumentService({ prisma, sd: fakeSd({ 54969: mkOrder(54969), 54970: mkOrder(54970), 54972: mkOrder(54972, { paymentAmount: 1 }) }) });
    Object.assign(base, { fopId, userId, recipientFopId });
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

  it('recipient: required, must exist and not be archived', async () => {
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969, recipientFopId: 0 })).rejects.toMatchObject({ code: 'RECIPIENT_REQUIRED', status: 400 });
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969, recipientFopId: 99999 })).rejects.toMatchObject({ code: 'RECIPIENT_NOT_FOUND', status: 404 });
    await clients.updateFop(recipientFopId, { archived: true });
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 })).rejects.toMatchObject({ code: 'RECIPIENT_ARCHIVED', status: 409 });
  });

  it('remembers the chosen recipient for the SalesDrive contact', async () => {
    expect(await svc.defaultRecipientFor(500)).toBeNull();
    await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 });
    expect(await svc.defaultRecipientFor(500)).toBe(recipientFopId);
    const c2 = await clients.createClient({ name: 'BabyTop', fop: { name: 'ФОП Іваненко І.І.', requisites: 'ІПН 1234567890' } });
    await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970, recipientFopId: c2.fops[0]!.id });
    expect(await svc.defaultRecipientFor(500)).toBe(c2.fops[0]!.id);
    await clients.updateFop(c2.fops[0]!.id, { archived: true });
    expect(await svc.defaultRecipientFor(500)).toBeNull(); // archived default is not suggested
  });

  it('regeneration may switch the recipient; number kept, header snapshot updated', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    const c2 = await clients.createClient({ name: 'BabyTop', fop: { name: 'ФОП Іваненко І.І.', requisites: 'ІПН 1234567890' } });
    const b = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969, recipientFopId: c2.fops[0]!.id });
    expect([b.documentId, b.number]).toEqual([a.documentId, a.number]);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: a.documentId } })).clientFopId).toBe(c2.fops[0]!.id);
    const v = await prisma.documentVersion.findFirstOrThrow({ where: { documentId: a.documentId }, orderBy: { id: 'desc' } });
    expect((v.headerJson as { recipient: string }).recipient).toContain('ФОП Іваненко І.І.');
    const [row] = await svc.listDocuments({ q: 'babytop' });
    expect(row).toMatchObject({ clientName: 'BabyTop — ФОП Іваненко І.І.', number: a.number });
  });

  it('deleting the recipient client keeps documents: file downloads, history shows «(видалено)», regeneration picks a new recipient', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    const fop = await prisma.clientFop.findUniqueOrThrow({ where: { id: recipientFopId } });
    expect(await clients.usage(fop.clientId)).toEqual({ fops: 1, documents: 1 });
    await clients.deleteClient(fop.clientId);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: a.documentId } })).clientFopId).toBeNull();
    expect(await svc.defaultRecipientFor(500)).toBeNull();
    const [row] = await svc.listDocuments();
    expect(row).toMatchObject({ number: 1, clientName: 'ФОП Палій Анна (видалено)' });
    expect((await svc.downloadDocument(a.documentId)).file.length).toBeGreaterThan(1000);
    const c2 = await clients.createClient({ name: 'BabyTop', fop: { name: 'ФОП Іваненко І.І.', requisites: 'ІПН 1234567890' } });
    const b = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969, recipientFopId: c2.fops[0]!.id });
    expect([b.documentId, b.number]).toEqual([a.documentId, 1]);
  });

  it('archived supplier (our FOP) → FOP_ARCHIVED', async () => {
    await prisma.ourFop.update({ where: { id: fopId }, data: { archived: true } });
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 })).rejects.toMatchObject({ code: 'FOP_ARCHIVED', status: 409 });
  });

  it('order not found → ORDER_NOT_FOUND (404)', async () => {
    await expect(svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 1 })).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('annulled rahunok can be re-issued with a NEW number; the old number stays taken', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    expect(a.number).toBe(1);
    await svc.annulDocument(a.documentId, userId);
    const b = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    expect(b.number).toBe(2);
    expect(b.documentId).not.toBe(a.documentId);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: a.documentId } })).status).toBe('ANNULLED');
    // regenerating the re-issued one keeps its number
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 })).number).toBe(2);
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970 })).number).toBe(3);
    const hist = await svc.listDocuments();
    expect(hist.filter(h => h.sdOrderId === 54969 && h.type === 'RAHUNOK').map(h => [h.number, h.status]).sort()).toEqual([[1, 'ANNULLED'], [2, 'ACTIVE']]);
  });

  it('annulled nakladna can be re-issued (number = order id again); annulled RAHUNOK may move to another FOP', async () => {
    const a = await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 });
    await svc.annulDocument(a.documentId, userId);
    const b = await svc.generateDocument({ ...base, type: 'NAKLADNA', sdOrderId: 54969 });
    expect(b.number).toBe(54969);
    expect(b.documentId).not.toBe(a.documentId);
    const other = (await makeFop('ФОП Кастирін')).id;
    const r = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970 });
    await svc.annulDocument(r.documentId, userId);
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970, fopId: other })).number).toBe(1);
  });

  it('annulling twice is rejected', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    await svc.annulDocument(a.documentId, userId);
    await expect(svc.annulDocument(a.documentId, userId)).rejects.toMatchObject({ status: 409 });
  });

  it('concurrent re-issue after annul → still a single active document', async () => {
    const a = await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 });
    await svc.annulDocument(a.documentId, userId);
    const rs = await Promise.all([1, 2, 3].map(() => svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54969 })));
    expect(new Set(rs.map(r => r.number))).toEqual(new Set([2]));
    expect(await prisma.document.count({ where: { sdOrderId: 54969, type: 'RAHUNOK', status: 'ACTIVE' } })).toBe(1);
    expect((await svc.generateDocument({ ...base, type: 'RAHUNOK', sdOrderId: 54970 })).number).toBe(3);
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
    expect(row).toMatchObject({ number: 1, date: '2026-12-01', type: 'RAHUNOK', sdOrderId: 54969, clientName: 'Палій — ФОП Палій Анна', status: 'ACTIVE' });
    const f = await svc.downloadDocument(a.documentId);
    expect(f.filename).toBe('Рахунок-фактура_1_2026-12-01.xlsx');
    expect(f.file.length).toBeGreaterThan(1000);
  });

  it('supplier phone is printed as is (no "тел." prefix), as in рахунок №14', () => {
    expect(partyText('ФОП Кастирін', 'Юр. адреса: Харків\nІПН 1', '063 382 31 69')).toBe('ФОП Кастирін\n063 382 31 69\nЮр. адреса: Харків\nІПН 1');
  });

  it('parseDocDate rejects garbage', () => {
    expect(() => parseDocDate('2026-13-01')).toThrow();
    expect(() => parseDocDate('abc')).toThrow();
    expect(parseDocDate('2026-02-28').getDate()).toBe(28);
  });
});
