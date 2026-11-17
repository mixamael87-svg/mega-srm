import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma, resetDb, makeFop } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as getOrder } from '../../app/api/orders/[id]/route';
import { POST as generate, GET as list } from '../../app/api/documents/route';
import { PUT as saveClient } from '../../app/api/client-fops/route';

const req = (url: string, init: RequestInit = {}, cookie = '') =>
  new Request(`http://localhost${url}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('orders & documents API (SalesDrive mock)', () => {
  let cookie = '', fopId = 0;
  beforeAll(() => { process.env.SALESDRIVE_MOCK = '1'; });
  beforeEach(async () => {
    await resetDb();
    fopId = (await makeFop('ФОП Кузнецов', true)).id;
    await prisma.user.create({ data: { login: 'm', passwordHash: await hashPassword('pass1234') } });
    const res = await login(req('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: 'm', password: 'pass1234' }) }));
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  });
  afterAll(() => prisma.$disconnect());

  it('bad order numbers → clear messages, not 500', async () => {
    for (const bad of ['abc', '0', '-1', '1.5', '99999999999']) {
      const r = await getOrder(req(`/api/orders/${bad}`, {}, cookie), params(bad));
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: 'Введіть номер замовлення' });
    }
    const r = await getOrder(req('/api/orders/123', {}, cookie), params('123'));
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe('Замовлення № 123 не знайдено в SalesDrive');
  });

  it('preview: lines, mix colours, defaults, missing recipient', async () => {
    const r = await getOrder(req('/api/orders/54969', {}, cookie), params('54969'));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.order.lines).toHaveLength(68);
    expect(j.mix).toEqual([{ lineIndex: 0, colours: expect.arrayContaining([expect.objectContaining({ id: 'c1', name: 'Ніблер (рожевий)' })]) }]);
    expect(j.mix[0].colours).toHaveLength(4);
    expect(j.defaultFopId).toBe(fopId);
    expect(j.defaultDate).toBe('2026-11-12');
    expect(j.recipient).toBeNull();
  });

  it('recipient requisites: blocked → saved → used automatically; mix split 6/6/6/6 → 71 lines', async () => {
    const body = { type: 'NAKLADNA', sdOrderId: 54969, fopId, date: '2026-11-12', splits: [{ lineIndex: 0, parts: ['c1', 'c2', 'c3', 'c4'].map(variantId => ({ variantId, qty: 6 })) }] };
    const blocked = await generate(req('/api/documents', { method: 'POST', body: JSON.stringify(body) }, cookie));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: 'RECIPIENT_REQUISITES_MISSING' });

    const saved = await saveClient(req('/api/client-fops', { method: 'PUT', body: JSON.stringify({ sdContactId: 40001, name: 'ФОП Демо Клієнт', requisites: 'ІПН 1111111111' }) }, cookie));
    expect(saved.status).toBe(200);
    const again = await getOrder(req('/api/orders/54969', {}, cookie), params('54969'));
    expect((await again.json()).recipient).toMatchObject({ name: 'ФОП Демо Клієнт' });

    const ok = await generate(req('/api/documents', { method: 'POST', body: JSON.stringify(body) }, cookie));
    expect(ok.status).toBe(200);
    expect(decodeURIComponent(ok.headers.get('x-filename')!)).toBe('Видаткова_накладна_54969_2026-11-12.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await ok.arrayBuffer()) as any);
    let productRows = 0;
    wb.worksheets[0]!.eachRow(r => { if (/^\d+$/.test(String(r.getCell(1).text)) && String(r.getCell(2).text) !== '') productRows++; });
    expect(productRows).toBe(71);

    const hist = await (await list(req('/api/documents', {}, cookie))).json();
    expect(hist[0]).toMatchObject({ type: 'NAKLADNA', number: 54969, clientName: 'ФОП Демо Клієнт' });
  });

  it('bad split → 422 with code; bad body → 400', async () => {
    await prisma.clientFop.create({ data: { sdContactId: 40001, name: 'ФОП Демо', requisites: 'ІПН 1' } });
    const r = await generate(req('/api/documents', { method: 'POST', body: JSON.stringify({ type: 'RAHUNOK', sdOrderId: 54969, fopId, date: '2026-11-12', splits: [{ lineIndex: 0, parts: [{ variantId: 'c1', qty: 5 }] }] }) }, cookie));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ code: 'SPLIT_SUM_MISMATCH', error: '«Ніблер (Мікс) (0001)»: розбито 5 з 24' });
    const bad = await generate(req('/api/documents', { method: 'POST', body: JSON.stringify({ type: 'X' }) }, cookie));
    expect(bad.status).toBe(400);
    const broken = await generate(req('/api/documents', { method: 'POST', body: '{"type":"RAHUNOK",' }, cookie));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ error: 'Невірні дані' });
  });
});
