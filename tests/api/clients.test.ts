import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as listClients, POST as createClient } from '../../app/api/clients/route';
import { PATCH as patchClient } from '../../app/api/clients/[id]/route';
import { POST as addFop } from '../../app/api/clients/[id]/fops/route';
import { PATCH as patchFop } from '../../app/api/client-fops/[id]/route';

const req = (url: string, init: RequestInit = {}, cookie = '') =>
  new Request(`http://localhost${url}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });

describe('clients API', () => {
  let cookie = '';
  beforeEach(async () => {
    await resetDb();
    await prisma.user.create({ data: { login: 'm', passwordHash: await hashPassword('pass1234') } }); // manager
    const res = await login(req('/api/auth/login', json({ login: 'm', password: 'pass1234' })));
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  });
  afterAll(() => prisma.$disconnect());

  it('requires a session', async () => {
    expect((await listClients(req('/api/clients'))).status).toBe(401);
    expect((await createClient(req('/api/clients', json({ name: 'X' })))).status).toBe(401);
  });

  it('a manager creates a client with a FOP, adds another, edits, archives, searches', async () => {
    const c = await createClient(req('/api/clients', json({ name: 'BabyTop', phone: '067 111 22 33', fop: { name: 'ФОП Іваненко І.І.', requisites: 'ІПН 1234567890' } }), cookie));
    expect(c.status).toBe(201);
    const client = await c.json();
    const f = await addFop(req(`/api/clients/${client.id}/fops`, json({ name: 'ФОП Петренко П.П.', requisites: 'ІПН 0987654321' }), cookie), params(client.id));
    expect(f.status).toBe(201);
    const fop = await f.json();
    expect((await patchClient(req(`/api/clients/${client.id}`, patch({ comment: 'мережа' }), cookie), params(client.id))).status).toBe(200);
    expect((await patchFop(req(`/api/client-fops/${fop.id}`, patch({ archived: true }), cookie), params(fop.id))).status).toBe(200);

    const found = await (await listClients(req('/api/clients?q=1234567890', {}, cookie))).json();
    expect(found).toEqual([expect.objectContaining({ name: 'BabyTop', comment: 'мережа', fops: [expect.objectContaining({ name: 'ФОП Іваненко І.І.' })] })]);
    const withArchived = await (await listClients(req('/api/clients?archived=1', {}, cookie))).json();
    expect(withArchived[0].fops).toHaveLength(2);
  });

  it('blank names → 400 with a message; unknown ids → 404; bad id → 400', async () => {
    const blank = await createClient(req('/api/clients', json({ name: '   ' }), cookie));
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: 'Вкажіть назву клієнта' });
    const missingReq = await createClient(req('/api/clients', json({ name: 'X', fop: { name: 'ФОП', requisites: ' ' } }), cookie));
    expect(missingReq.status).toBe(400);
    expect((await patchFop(req('/api/client-fops/99999', patch({ name: 'a' }), cookie), params(99999))).status).toBe(404);
    expect((await addFop(req('/api/clients/99999/fops', json({ name: 'a', requisites: 'b' }), cookie), params(99999))).status).toBe(404);
    expect((await patchClient(req('/api/clients/abc', patch({ name: 'a' }), cookie), params('abc'))).status).toBe(400);
    expect((await createClient(req('/api/clients', { method: 'POST', body: '{"name":' }, cookie))).status).toBe(400);
  });
});
