import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as docLabels } from '../../app/api/documents/[id]/labels/route';
import { GET as orderLabels } from '../../app/api/orders/[id]/labels/route';
import { POST as printLabels } from '../../app/api/label-sets/[id]/print/route';
import type { DocLine } from '../../src/domain/types';

const req = (url: string, cookie = '') => new Request(`http://localhost${url}`, { headers: cookie ? { cookie } : {} });
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
let n = 0;
const line = (sku: string, qty: number, name = `Товар ${sku}`): DocLine => ({ no: ++n, sku, name, barcode: '', qty, priceKop: 100, sumKop: qty * 100 });

describe('labels for a document', () => {
  let cookie = '', zag = 0, userId = 0, fopId = 0;
  async function makeDoc(type: 'NAKLADNA' | 'RAHUNOK', lines: DocLine[], status: 'ACTIVE' | 'ANNULLED' = 'ACTIVE', number = 54969) {
    const d = await prisma.document.create({ data: { type, number, date: new Date('2026-11-17'), fopId, sdOrderId: number, status, createdById: userId } });
    await prisma.documentVersion.create({ data: { documentId: d.id, linesJson: [line('9999', 1)], totalsJson: {}, headerJson: {}, createdById: userId } });
    await prisma.documentVersion.create({ data: { documentId: d.id, linesJson: lines, totalsJson: {}, headerJson: {}, createdById: userId } });
    return d.id;
  }
  beforeEach(async () => {
    await resetDb();
    fopId = (await makeFop()).id;
    userId = (await prisma.user.create({ data: { login: 'm', passwordHash: await hashPassword('pass1234') } })).id;
    const res = await login(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'm', password: 'pass1234' }) }));
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    zag = (await prisma.labelSet.findFirstOrThrow({ where: { name: 'Загальна' } })).id;
    await prisma.label.create({ data: { setId: zag, sku: '0205', text: 'Пляшка\nАрт. 0205', barcode: '4826077002053' } });
  });
  afterAll(() => prisma.$disconnect());

  it('document list: latest version, one row per sku with status', async () => {
    const id = await makeDoc('NAKLADNA', [line('0205', 3, 'Пляшка'), line('0412', 1, 'Пустушка'), line('0205', 2, 'Пляшка')]);
    const r = await docLabels(req(`/x?set=${zag}`, cookie), params(id));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      setName: 'Загальна', title: 'накладна 54969',
      rows: [
        { sku: '0205', name: 'Пляшка', qty: 5, status: 'ok', extra: null },
        { sku: '0412', name: 'Пустушка', qty: 1, status: 'missing', extra: null },
      ],
    });
  });

  it('order list straight from SalesDrive (mock order 54969), no document needed', async () => {
    process.env.SALESDRIVE_MOCK = '1';
    await prisma.label.create({ data: { setId: zag, sku: '0102', text: 'Арт. 0102', barcode: '4826077001025' } });
    const r = await orderLabels(req(`/x?set=${zag}`, cookie), params(54969));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.title).toBe('заявка 54969');
    expect(j.rows.find((x: { sku: string }) => x.sku === '0102')).toMatchObject({ qty: 3, status: 'ok' });
    expect(j.rows.find((x: { sku: string }) => x.sku === '0103')).toMatchObject({ status: 'missing' });
    expect((await orderLabels(req(`/x?set=${zag}`, cookie), params(1))).status).toBe(404);
  });

  it('print: edited list → one page per unit, unknown and noPrint dropped, named by title and set', async () => {
    await prisma.label.create({ data: { setId: zag, sku: '2004', text: 'Кулька', noPrint: true } });
    const body = { title: 'заявка 54969', items: [{ sku: '0205', qty: 2 }, { sku: '0412', qty: 5 }, { sku: '2004', qty: 3 }] };
    const r = await printLabels(new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }), params(zag));
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(decodeURIComponent(r.headers.get('content-disposition') ?? '')).toContain('Наклейки_заявка 54969_Загальна.pdf');
    expect(Buffer.from(await r.arrayBuffer()).toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  });

  it('print with nothing printable → 409 NOTHING_TO_PRINT; no session → 401', async () => {
    const mk = (c: string) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: JSON.stringify({ title: 't', items: [{ sku: '0412', qty: 2 }] }) });
    const r = await printLabels(mk(cookie), params(zag));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('NOTHING_TO_PRINT');
    expect((await printLabels(mk(''), params(zag))).status).toBe(401);
  });

  it('rahunok and annulled nakladna → 409 LABELS_NOT_ALLOWED', async () => {
    const rah = await makeDoc('RAHUNOK', [line('0205', 1)], 'ACTIVE', 14);
    const ann = await makeDoc('NAKLADNA', [line('0205', 1)], 'ANNULLED', 54970);
    for (const id of [rah, ann]) {
      const r = await docLabels(req(`/x?set=${zag}`, cookie), params(id));
      expect(r.status).toBe(409);
      expect((await r.json()).code).toBe('LABELS_NOT_ALLOWED');
    }
  });

  it('unknown set or document → 404; no session → 401', async () => {
    const id = await makeDoc('NAKLADNA', [line('0412', 2)]);
    expect((await docLabels(req(`/x?set=9999`, cookie), params(id))).status).toBe(404);
    expect((await docLabels(req(`/x?set=${zag}`, cookie), params(9999))).status).toBe(404);
    expect((await docLabels(req(`/x?set=${zag}`), params(id))).status).toBe(401);
  });
});
