import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma, resetDb, makeFop } from '../setup/db';
import { createReportDocumentService } from '../../src/services/reportDocuments';
import { parseDocDate } from '../../src/services/documents';

const texts = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const t: string[] = []; wb.worksheets[0]!.eachRow(r => r.eachCell(c => { t.push(String(c.text)); })); return t;
};

describe('revaluation documents', () => {
  const svc = createReportDocumentService(prisma);
  let our = 0, clientFop = 0, clientId = 0, userId = 0;
  const nov = parseDocDate('2026-11-19');
  const lines = [{ sku: '0909', name: 'Набір іграшок для купання "Уточки"', qty: 3, priceKop: 8740 }, { sku: '0904', name: 'Аквакилимок "Кит"', qty: 2, priceKop: 15410 }];
  const ret = (o: object = {}) => ({ kind: 'POVERNENNYA' as const, number: 0, date: nov, supplier: { type: 'client' as const, id: clientFop }, recipient: { type: 'our' as const, id: our }, clientId, lines, userId, ...o });
  const rev = (o: object = {}) => ({ kind: 'PEREOTSINKA' as const, number: 0, date: nov, supplier: { type: 'our' as const, id: our }, recipient: { type: 'client' as const, id: clientFop }, clientId, lines: lines.map(l => ({ ...l, priceKop: l.priceKop + 500 })), userId, ...o });

  beforeEach(async () => {
    await resetDb();
    our = (await makeFop('ФОП Кузнецов')).id;
    const c = await prisma.client.create({ data: { name: 'Family Toys', fops: { create: { name: 'ФОП Іванов', requisites: 'ІПН 1' } } }, include: { fops: true } });
    clientId = c.id; clientFop = c.fops[0]!.id;
    userId = (await prisma.user.create({ data: { login: 'm', passwordHash: 'x' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it('povernennya: numbered by our side (recipient), title, parties, sum, file name', async () => {
    expect(await svc.nextNumber('POVERNENNYA', our, nov)).toBe(1);
    const a = await svc.create(ret({ number: 1 }));
    expect(a).toMatchObject({ number: 1, filename: 'Накладна_на_повернення_1_2026-11-19.xlsx' });
    const t = await texts(a.file);
    expect(t).toContain('Накладна на повернення № 1');
    expect(t.some(x => x.startsWith('ФОП Іванов'))).toBe(true);  // supplier = client FOP
    expect(t).toContain('570,40'); // 3×87,40 + 2×154,10
  });

  it('sums are qty × price', async () => {
    const a = await svc.create(ret({ number: 1 }));
    const [row] = await svc.list();
    expect(row).toMatchObject({ id: a.id, kind: 'POVERNENNYA', number: 1, netKop: 3 * 8740 + 2 * 15410, status: 'ACTIVE', clientName: 'Family Toys' });
  });

  it('pereotsinka: manual number moves the counter; duplicates need confirmation', async () => {
    const b = await svc.create(rev({ number: 7 }));
    expect(b.filename).toBe('Видаткова_накладна_переоцінка_7_2026-11-19.xlsx');
    expect(await texts(b.file)).toContain('Видаткова накладна № 7');
    expect(await svc.nextNumber('PEREOTSINKA', our, nov)).toBe(8);
    expect(await svc.nextNumber('POVERNENNYA', our, nov)).toBe(1); // separate counter per kind
    await expect(svc.create(rev({ number: 7 }))).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_NUMBER' });
    expect((await svc.create(rev({ number: 7, allowDuplicate: true }))).number).toBe(7);
  });

  it('validation: missing/zero new price, empty lines, bad number, foreign client FOP', async () => {
    await expect(svc.create(rev({ number: 1, lines: [{ ...lines[0]!, priceKop: 0 }] }))).rejects.toMatchObject({ status: 400, message: 'Вкажіть нову ціну для всіх рядків' });
    await expect(svc.create(ret({ number: 1, lines: [] }))).rejects.toMatchObject({ status: 400, message: 'Немає рядків' });
    await expect(svc.create(ret({ number: 1, lines: [{ ...lines[0]!, qty: 0 }] }))).rejects.toMatchObject({ status: 400 });
    await expect(svc.create(ret({ number: 0 }))).rejects.toMatchObject({ status: 400, message: 'Вкажіть номер документа' });
    const other = await prisma.client.create({ data: { name: 'Інший', fops: { create: { name: 'ФОП Чужий', requisites: 'ІПН 2' } } }, include: { fops: true } });
    await expect(svc.create(ret({ number: 1, supplier: { type: 'client', id: other.fops[0]!.id } }))).rejects.toMatchObject({ status: 400 });
  });

  it('both parties not ours → no counter, number required as typed', async () => {
    const c2 = await prisma.clientFop.create({ data: { clientId, name: 'ФОП Іванов-2', requisites: 'ІПН 3' } });
    const d = await svc.create(ret({ number: 5, recipient: { type: 'client', id: c2.id } }));
    expect(d.number).toBe(5);
    expect(await svc.nextNumber('POVERNENNYA', our, nov)).toBe(1);
  });

  it('download from snapshot; annul once', async () => {
    const a = await svc.create(ret({ number: 1 }));
    expect((await svc.download(a.id)).filename).toBe('Накладна_на_повернення_1_2026-11-19.xlsx');
    await svc.annul(a.id);
    expect((await svc.list())[0]!.status).toBe('ANNULLED');
    await expect(svc.annul(a.id)).rejects.toMatchObject({ status: 409 });
    await expect(svc.download(99999)).rejects.toMatchObject({ status: 404 });
    // an annulled document doesn't count as a duplicate
    expect((await svc.create(ret({ number: 1 }))).number).toBe(1);
  });
});
