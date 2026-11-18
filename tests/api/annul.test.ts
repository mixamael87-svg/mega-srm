import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as annul } from '../../app/api/documents/[id]/annul/route';

const req = (url: string, init: RequestInit = {}, cookie = '') =>
  new Request(`http://localhost${url}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('annul API', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('a manager can annul a document; unauthenticated → 401; twice → 409', async () => {
    const u = await prisma.user.create({ data: { login: 'm', passwordHash: await hashPassword('pass1234') } });
    const cookie = ((await login(req('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: 'm', password: 'pass1234' }) }))).headers.get('set-cookie') ?? '').split(';')[0]!;
    const fop = await makeFop('ФОП Кузнецов');
    const d = await prisma.document.create({ data: { type: 'NAKLADNA', number: 54969, date: new Date(Date.UTC(2026, 10, 12)), fopId: fop.id, sdOrderId: 54969, createdById: u.id } });
    expect((await annul(req(`/api/documents/${d.id}/annul`, { method: 'POST' }), params(d.id))).status).toBe(401);
    expect((await annul(req(`/api/documents/${d.id}/annul`, { method: 'POST' }, cookie), params(d.id))).status).toBe(200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('ANNULLED');
    expect((await annul(req(`/api/documents/${d.id}/annul`, { method: 'POST' }, cookie), params(d.id))).status).toBe(409);
  });
});
