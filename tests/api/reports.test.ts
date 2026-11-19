import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { prisma, resetDb } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as parse } from '../../app/api/reports/parse/route';
import { POST as setCode } from '../../app/api/reports/codes/route';
import { POST as exportXlsx } from '../../app/api/reports/export/route';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/reports/${n}`, import.meta.url));
const upload = (clientId: number | string, file: Buffer | Uint8Array, name: string, cookie: string) => {
  const fd = new FormData();
  fd.set('clientId', String(clientId));
  fd.set('file', new Blob([new Uint8Array(file)]), name);
  return new Request('http://localhost/api/reports/parse', { method: 'POST', body: fd, headers: { cookie } });
};
const jreq = (url: string, body: unknown, cookie: string) => new Request(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie } });

describe('client reports API', () => {
  let cookie = '', clientId = 0;
  beforeAll(() => { process.env.SALESDRIVE_MOCK = '1'; });
  beforeEach(async () => {
    await resetDb();
    await prisma.user.create({ data: { login: 'm', passwordHash: await hashPassword('pass1234') } });
    cookie = ((await login(jreq('/api/auth/login', { login: 'm', password: 'pass1234' }, ''))).headers.get('set-cookie') ?? '').split(';')[0]!;
    clientId = (await prisma.client.create({ data: { name: 'Demo Kids' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it('turnover teaches codes; stock without barcodes is then matched; foreign item unmatched', async () => {
    const t = await (await parse(upload(clientId, fixture('bagel-turnover.xls'), 't.xls', cookie))).json();
    expect(t.report).toMatchObject({ kind: 'turnover', stores: ['Магазин DEMO KIDS ТЦ "Центр"', 'Магазин DEMO KIDS ТЦ "Парк"'] });
    expect([t.matched.length, t.unmatched.length]).toEqual([6, 1]);
    expect(t.matched[0]).toMatchObject({ code: '88514', sku: '0909', ourName: null });
    const s = await (await parse(upload(clientId, fixture('bagel-stock.xls'), 's.xls', cookie))).json();
    expect([s.matched.length, s.unmatched.length]).toEqual([6, 1]);
    expect(s.unmatched[0]).toMatchObject({ code: '90001', name: 'Чужий товар' });
    // manual mapping is remembered for the next upload
    expect((await setCode(jreq('/api/reports/codes', { clientId, code: '90001', sku: '0726' }, cookie))).status).toBe(200);
    const s2 = await (await parse(upload(clientId, fixture('bagel-stock.xls'), 's.xls', cookie))).json();
    expect([s2.matched.length, s2.unmatched.length]).toEqual([7, 0]);
  });

  it('errors: no session 401, unknown format 422, too big 413, unknown client 404', async () => {
    expect((await parse(upload(clientId, fixture('bagel-stock.xls'), 's.xls', ''))).status).toBe(401);
    const bad = await parse(upload(clientId, Buffer.from('not an excel file at all'), 'x.xls', cookie));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ error: 'Формат файлу не розпізнано' });
    expect((await parse(upload(clientId, Buffer.alloc(5 * 1024 * 1024 + 1), 'big.xls', cookie))).status).toBe(413);
    expect((await parse(upload(99999, fixture('bagel-stock.xls'), 's.xls', cookie))).status).toBe(404);
  });

  it('export: our-format Excel with old/new prices and sums', async () => {
    const res = await exportXlsx(jreq('/api/reports/export', {
      meta: { client: 'Demo Kids', title: 'Залишок товару по постачальникам', kind: 'stock', dateFrom: '01.11.2026', dateTo: '02.11.2026', store: 'Усі магазини' },
      rows: [{ sku: '0909', name: 'Уточки', priceKop: 8740, qty: 3, opening: 0, incoming: 0, soldRetail: 0, soldOther: 0, newPriceKop: 9000 }],
    }, cookie));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
    const texts: string[] = []; wb.worksheets[0]!.eachRow(r => r.eachCell(c => { texts.push(String(c.text)); }));
    for (const t of ['Артикул', 'Назва', 'Штрихкод', 'К-сть', 'Стара ціна', 'Нова ціна', 'Сума стара', 'Сума нова', '0909', 'Уточки', '4826077009090', '87,40', '90,00', '262,20', '270,00', 'Demo Kids']) expect(texts).toContain(t);
  });
});
