import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as listFops, PATCH as patchFop } from '../../app/api/fops/route';
import { DELETE as deleteFop, GET as fopUsage } from '../../app/api/fops/[id]/route';
import { GET as getOrder } from '../../app/api/orders/[id]/route';

const req = (url: string, init: RequestInit = {}, cookie = '') =>
  new Request(`http://localhost${url}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
async function cookieFor(loginName: string, role: 'admin' | 'manager') {
  await prisma.user.create({ data: { login: loginName, passwordHash: await hashPassword('pass1234'), role } });
  const res = await login(req('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: loginName, password: 'pass1234' }) }));
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}

describe('our FOPs API', () => {
  let admin = '', manager = '';
  beforeAll(() => { process.env.SALESDRIVE_MOCK = '1'; });
  beforeEach(async () => { await resetDb(); admin = await cookieFor('boss', 'admin'); manager = await cookieFor('m', 'manager'); });
  afterAll(() => prisma.$disconnect());

  it('delete: manager → 403; admin → deleted; usage for the warning', async () => {
    const f = await makeFop('ФОП Помилковий');
    expect((await deleteFop(req(`/api/fops/${f.id}`, { method: 'DELETE' }, manager), params(f.id))).status).toBe(403);
    expect(await (await fopUsage(req(`/api/fops/${f.id}`, {}, admin), params(f.id))).json()).toEqual({ documents: 0 });
    const res = await deleteFop(req(`/api/fops/${f.id}`, { method: 'DELETE' }, admin), params(f.id));
    expect(await res.json()).toEqual({ deleted: true, archived: false });
    expect((await deleteFop(req(`/api/fops/${f.id}`, { method: 'DELETE' }, admin), params(f.id))).status).toBe(404);
  });

  it('PATCH with only {id, archived:false} restores without wiping requisites', async () => {
    const f = await prisma.ourFop.create({ data: { name: 'ФОП Кастирін', requisites: 'ІПН 3182206732', phone: '063', archived: true } });
    expect((await patchFop(req('/api/fops', { method: 'PATCH', body: JSON.stringify({ id: f.id, archived: false }) }, admin))).status).toBe(200);
    expect(await prisma.ourFop.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ archived: false, requisites: 'ІПН 3182206732', phone: '063', name: 'ФОП Кастирін' });
    const all = await (await listFops(req('/api/fops', {}, admin))).json();
    expect(all.map((x: any) => x.name)).toEqual(['ФОП Кастирін']);
  });

  it('order preview: archived FOPs are not offered and never default', async () => {
    const a = await prisma.ourFop.create({ data: { name: 'ФОП Архівний', requisites: 'ІПН 1', isDefault: true, archived: true } });
    const b = await makeFop('ФОП Діючий');
    const j = await (await getOrder(req('/api/orders/54969', {}, manager), params('54969'))).json();
    expect(j.fops).toEqual([{ id: b.id, name: 'ФОП Діючий' }]);
    expect(j.defaultFopId).toBe(b.id);
    void a;
  });
});
