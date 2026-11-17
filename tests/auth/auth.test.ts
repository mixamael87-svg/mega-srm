import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../setup/db';
import { hashPassword, verifyPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { GET as listUsers, POST as createUser } from '../../app/api/users/route';

const json = (url: string, body: unknown, cookie?: string) =>
  new Request(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const get = (url: string, cookie?: string) => new Request(`http://localhost${url}`, { headers: cookie ? { cookie } : {} });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0]!;

async function addUser(login: string, password: string, role: 'admin' | 'manager' = 'manager', active = true) {
  return prisma.user.create({ data: { login, passwordHash: await hashPassword(password), role, active } });
}
async function loginAs(l: string, p: string) {
  const res = await login(json('/api/auth/login', { login: l, password: p }));
  return { res, cookie: cookieOf(res) };
}

describe('auth', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('password hash roundtrip', async () => {
    const h = await hashPassword('секрет-1');
    expect(h).not.toBe('секрет-1');
    expect(await verifyPassword('секрет-1', h)).toBe(true);
    expect(await verifyPassword('секрет-2', h)).toBe(false);
  });

  it('correct password → session cookie', async () => {
    await addUser('olena', 'pass1234');
    const { res, cookie } = await loginAs('olena', 'pass1234');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ login: 'olena', role: 'manager' });
    expect(cookie).toMatch(/^srm_session=.+/);
  });

  it('wrong password / unknown login / inactive → 401 with the same message', async () => {
    await addUser('olena', 'pass1234');
    await addUser('old', 'pass1234', 'manager', false);
    for (const [l, p] of [['olena', 'nope'], ['ghost', 'pass1234'], ['old', 'pass1234']]) {
      const { res } = await loginAs(l!, p!);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Невірний логін або пароль' });
    }
  });

  it('no session → 401; manager → 403 on users API', async () => {
    expect((await listUsers(get('/api/users'))).status).toBe(401);
    await addUser('m', 'pass1234');
    const { cookie } = await loginAs('m', 'pass1234');
    expect((await listUsers(get('/api/users', cookie))).status).toBe(403);
    expect((await createUser(json('/api/users', { login: 'x', password: 'pass1234', role: 'manager' }, cookie))).status).toBe(403);
  });

  it('admin creates a manager who can then log in; list hides hashes', async () => {
    await addUser('boss', 'adminpass', 'admin');
    const { cookie } = await loginAs('boss', 'adminpass');
    const res = await createUser(json('/api/users', { login: 'ivan', password: 'ivanpass1', role: 'manager' }, cookie));
    expect(res.status).toBe(201);
    expect((await loginAs('ivan', 'ivanpass1')).res.status).toBe(200);
    const list = await (await listUsers(get('/api/users', cookie))).json();
    expect(list.map((u: any) => u.login).sort()).toEqual(['boss', 'ivan']);
    expect(JSON.stringify(list)).not.toContain('passwordHash');
  });

  it('validation: short password, duplicate login', async () => {
    await addUser('boss', 'adminpass', 'admin');
    const { cookie } = await loginAs('boss', 'adminpass');
    expect((await createUser(json('/api/users', { login: 'a', password: '123', role: 'manager' }, cookie))).status).toBe(400);
    const dup = await createUser(json('/api/users', { login: 'boss', password: 'longenough', role: 'manager' }, cookie));
    expect(dup.status).toBe(409);
  });

  it('deactivated user loses access with an existing cookie', async () => {
    const u = await addUser('boss', 'adminpass', 'admin');
    const { cookie } = await loginAs('boss', 'adminpass');
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect((await listUsers(get('/api/users', cookie))).status).toBe(401);
  });

  it('logout clears the session', async () => {
    await addUser('boss', 'adminpass', 'admin');
    const { cookie } = await loginAs('boss', 'adminpass');
    const out = await logout(json('/api/auth/logout', {}, cookie));
    expect(out.status).toBe(200);
    const cleared = cookieOf(out);
    expect((await listUsers(get('/api/users', cleared))).status).toBe(401);
  });
});
