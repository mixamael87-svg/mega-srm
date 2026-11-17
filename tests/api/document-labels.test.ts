import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as docLabels } from '../../app/api/documents/[id]/labels/route';
import type { DocLine } from '../../src/domain/types';

const req = (url: string, cookie = '') => new Request(`http://localhost${url}`, { headers: cookie ? { cookie } : {} });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
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

  it('json summary uses the latest version: printed count and missing items', async () => {
    const id = await makeDoc('NAKLADNA', [line('0205', 3, 'Пляшка'), line('0412', 1, 'Пустушка')]);
    const r = await docLabels(req(`/x?set=${zag}&format=json`, cookie), params(id));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ setName: 'Загальна', printedCount: 3, missing: [{ sku: '0412', name: 'Пустушка', qty: 1 }], noPrint: [] });
  });

  it('pdf has one page per label, named after the nakladna and the set', async () => {
    const id = await makeDoc('NAKLADNA', [line('0205', 3), line('0412', 1)]);
    const r = await docLabels(req(`/x?set=${zag}&format=pdf`, cookie), params(id));
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(decodeURIComponent(r.headers.get('content-disposition') ?? '')).toContain('Наклейки_54969_Загальна.pdf');
    const s = Buffer.from(await r.arrayBuffer()).toString('latin1');
    expect(s.match(/\/Type \/Page\b/g)).toHaveLength(3);
  });

  it('rahunok and annulled nakladna → 409 LABELS_NOT_ALLOWED', async () => {
    const rah = await makeDoc('RAHUNOK', [line('0205', 1)], 'ACTIVE', 14);
    const ann = await makeDoc('NAKLADNA', [line('0205', 1)], 'ANNULLED', 54970);
    for (const id of [rah, ann]) {
      const r = await docLabels(req(`/x?set=${zag}&format=json`, cookie), params(id));
      expect(r.status).toBe(409);
      expect((await r.json()).code).toBe('LABELS_NOT_ALLOWED');
    }
  });

  it('unknown set or document → 404; nothing to print as pdf → 409 NOTHING_TO_PRINT; no session → 401', async () => {
    const id = await makeDoc('NAKLADNA', [line('0412', 2)]);
    expect((await docLabels(req(`/x?set=9999&format=json`, cookie), params(id))).status).toBe(404);
    expect((await docLabels(req(`/x?set=${zag}&format=json`, cookie), params(9999))).status).toBe(404);
    const r = await docLabels(req(`/x?set=${zag}&format=pdf`, cookie), params(id));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('NOTHING_TO_PRINT');
    expect((await docLabels(req(`/x?set=${zag}&format=json`), params(id))).status).toBe(401);
  });
});
