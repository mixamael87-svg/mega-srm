import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as list, POST as create } from '../../app/api/report-documents/route';
import { GET as next } from '../../app/api/report-documents/next-number/route';
import { GET as file } from '../../app/api/report-documents/[id]/file/route';
import { POST as annul } from '../../app/api/report-documents/[id]/annul/route';

const req = (url: string, init: RequestInit = {}, cookie = '', accept = 'application/json') =>
  new Request(`http://localhost${url}`, { ...init, headers: { 'content-type': 'application/json', accept, ...(cookie ? { cookie } : {}) } });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('report documents API', () => {
  let cookie = '', our = 0, clientFop = 0, clientId = 0;
  beforeEach(async () => {
    await resetDb();
    await prisma.user.create({ data: { login: 'm', passwordHash: await hashPassword('pass1234') } });
    cookie = ((await login(req('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: 'm', password: 'pass1234' }) }))).headers.get('set-cookie') ?? '').split(';')[0]!;
    our = (await makeFop('ФОП Кузнецов')).id;
    const c = await prisma.client.create({ data: { name: 'Family Toys', fops: { create: { name: 'ФОП Іванов', requisites: 'ІПН 1' } } }, include: { fops: true } });
    clientId = c.id; clientFop = c.fops[0]!.id;
  });
  afterAll(() => prisma.$disconnect());

  const body = (o: object = {}) => JSON.stringify({ kind: 'POVERNENNYA', number: 1, date: '2026-11-19', supplier: { type: 'client', id: clientFop }, recipient: { type: 'our', id: our }, clientId, lines: [{ sku: '0909', name: 'Уточки', qty: 3, priceKop: 8740 }], ...o });

  it('manager: next number → create (json) → file → list → annul', async () => {
    expect((await list(req('/api/report-documents'))).status).toBe(401);
    expect(await (await next(req(`/api/report-documents/next-number?kind=POVERNENNYA&fopId=${our}&date=2026-11-19`, {}, cookie))).json()).toEqual({ number: 1 });
    const r = await create(req('/api/report-documents', { method: 'POST', body: body() }, cookie));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ number: 1, filename: 'Накладна_на_повернення_1_2026-11-19.xlsx' });
    const f = await file(req(`/api/report-documents/${j.id}/file`, {}, cookie), params(j.id));
    expect(f.headers.get('content-type')).toContain('spreadsheetml');
    expect(await (await list(req('/api/report-documents', {}, cookie))).json()).toEqual([expect.objectContaining({ id: j.id, kind: 'POVERNENNYA', number: 1, netKop: 26220 })]);
    expect((await annul(req(`/api/report-documents/${j.id}/annul`, { method: 'POST' }, cookie), params(j.id))).status).toBe(200);
  });

  it('duplicate number → 409 DUPLICATE_NUMBER; bad body → 400', async () => {
    await create(req('/api/report-documents', { method: 'POST', body: body() }, cookie));
    const dup = await create(req('/api/report-documents', { method: 'POST', body: body() }, cookie));
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: 'DUPLICATE_NUMBER' });
    expect((await create(req('/api/report-documents', { method: 'POST', body: body({ kind: 'X' }) }, cookie))).status).toBe(400);
    expect((await create(req('/api/report-documents', { method: 'POST', body: body({ date: '2026-13-01' }) }, cookie))).status).toBe(400);
  });
});
