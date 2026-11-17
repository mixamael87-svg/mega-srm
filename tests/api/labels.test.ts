import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../setup/db';
import { hashPassword } from '../../src/auth/password';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as listSets, POST as createSet } from '../../app/api/label-sets/route';
import { PATCH as renameSet, DELETE as deleteSet } from '../../app/api/label-sets/[id]/route';
import { GET as listLabels, POST as createLabel } from '../../app/api/label-sets/[id]/labels/route';
import { POST as importLabels } from '../../app/api/label-sets/[id]/import/route';
import { PATCH as patchLabel, DELETE as deleteLabel } from '../../app/api/labels/[id]/route';
import { GET as preview } from '../../app/api/labels/[id]/preview/route';

const req = (url: string, init: RequestInit = {}, cookie = '') =>
  new Request(`http://localhost${url}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });
const del = { method: 'DELETE' };

async function signIn(loginName: string, role: 'admin' | 'manager') {
  await prisma.user.create({ data: { login: loginName, role, passwordHash: await hashPassword('pass1234') } });
  const res = await login(req('/api/auth/login', post({ login: loginName, password: 'pass1234' })));
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}

describe('labels API', () => {
  let m = '', a = '', zag = 0, kuz = 0;
  beforeEach(async () => {
    await resetDb();
    m = await signIn('m', 'manager');
    a = await signIn('a', 'admin');
    zag = (await prisma.labelSet.findFirstOrThrow({ where: { name: 'Загальна' } })).id;
    kuz = (await prisma.labelSet.findFirstOrThrow({ where: { name: 'ТОВ Кузкас' } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it('requires a session', async () => {
    expect((await listSets(req('/api/label-sets'))).status).toBe(401);
    expect((await createLabel(req('/x', post({ sku: '0205', text: 't' })), params(zag))).status).toBe(401);
  });

  it('lists sets in order with label counts', async () => {
    await createLabel(req('/x', post({ sku: '0205', text: 't' }), m), params(zag));
    const sets = await (await listSets(req('/api/label-sets', {}, m))).json();
    expect(sets.map((s: { name: string; count: number }) => [s.name, s.count])).toEqual([['Загальна', 1], ['ФОП Кузнецов', 0], ['ТОВ Кузкас', 0]]);
  });

  it('a manager creates, edits and finds a label; barcode defaults from the sku', async () => {
    const r = await createLabel(req('/x', post({ sku: '0205', text: 'Пляшка для годування\nАрт. 0205', showMark: true }), m), params(zag));
    expect(r.status).toBe(201);
    const l = await r.json();
    expect(l).toMatchObject({ sku: '0205', barcode: '4826077002053', align: 'center', showMark: true, noPrint: false });
    expect((await patchLabel(req('/x', patch({ noPrint: true, align: 'left' }), m), params(l.id))).status).toBe(200);
    const found = await (await listLabels(req(`/x?q=годування`, {}, m), params(zag))).json();
    expect(found).toEqual([expect.objectContaining({ sku: '0205', noPrint: true, align: 'left', fits: true })]);
    expect(await (await listLabels(req(`/x?q=0205`, {}, m), params(zag))).json()).toHaveLength(1);
    expect(await (await listLabels(req(`/x?q=немає`, {}, m), params(zag))).json()).toHaveLength(0);
  });

  it('empty barcode stays empty; a manual barcode must be a valid EAN-13', async () => {
    const r = await (await createLabel(req('/x', post({ title: 'Частина 2', text: 'інструкція', barcode: '' }), m), params(zag))).json();
    expect(r).toMatchObject({ sku: null, barcode: '' });
    const bad = await createLabel(req('/x', post({ sku: '0206', text: 't', barcode: '4826077002054' }), m), params(zag));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('Невірний штрихкод');
  });

  it('validates sku, duplicates, text and the extra label set', async () => {
    const e = async (r: Promise<Response>) => { const x = await r; return [x.status, (await x.json()).error]; };
    expect(await e(createLabel(req('/x', post({ sku: '205', text: 't' }), m), params(zag)))).toEqual([400, 'Артикул — 4 цифри']);
    expect(await e(createLabel(req('/x', post({ sku: '0205', text: '  ' }), m), params(zag)))).toEqual([400, 'Вкажіть текст наклейки']);
    await createLabel(req('/x', post({ sku: '0205', text: 't' }), m), params(zag));
    expect(await e(createLabel(req('/x', post({ sku: '0205', text: 't' }), m), params(zag)))).toEqual([400, 'Наклейка з артикулом 0205 вже є в цьому наборі']);
    const other = await (await createLabel(req('/x', post({ title: 'Ч2', text: 'x', barcode: '' }), m), params(kuz))).json();
    expect(await e(createLabel(req('/x', post({ sku: '1205', text: 't', extraLabelId: other.id }), m), params(zag)))).toEqual([400, 'Додаткова наклейка має бути з того ж набору']);
    expect((await createLabel(req('/x', post({ sku: '0205', text: 't' }), m), params(9999))).status).toBe(404);
    expect((await patchLabel(req('/x', patch({ text: 'x' }), m), params(9999))).status).toBe(404);
  });

  it('only an admin deletes; links to a deleted extra label are cleared', async () => {
    const p2 = await (await createLabel(req('/x', post({ title: 'Частина 2', text: 'інструкція', barcode: '' }), m), params(zag))).json();
    const main = await (await createLabel(req('/x', post({ sku: '1205', text: 'Арт. 1205', extraLabelId: p2.id }), m), params(zag))).json();
    expect((await deleteLabel(req('/x', del, m), params(p2.id))).status).toBe(403);
    expect((await deleteLabel(req('/x', del, a), params(p2.id))).status).toBe(200);
    expect((await prisma.label.findUniqueOrThrow({ where: { id: main.id } })).extraLabelId).toBeNull();
  });

  it('sets: anyone creates and renames, only an admin deletes', async () => {
    const s = await createSet(req('/x', post({ name: 'Новий' }), m));
    expect(s.status).toBe(201);
    const set = await s.json();
    expect((await renameSet(req('/x', patch({ name: 'Новий 2' }), m), params(set.id))).status).toBe(200);
    expect((await createSet(req('/x', post({ name: 'Загальна' }), m))).status).toBe(400);
    expect((await deleteSet(req('/x', del, m), params(set.id))).status).toBe(403);
    expect((await deleteSet(req('/x', del, a), params(set.id))).status).toBe(200);
  });

  it('import is admin-only and idempotent; extraTitle links helper labels', async () => {
    const items = [
      { title: 'Частина 2 (серія 1200)', text: 'інструкція', barcode: '', align: 'left' },
      { sku: '1205', text: 'Арт. 1205', align: 'left', showMark: true, extraTitle: 'Частина 2 (серія 1200)' },
      { sku: '2004', text: 'Кулька', noPrint: true },
    ];
    expect((await importLabels(req('/x', post(items), m), params(zag))).status).toBe(403);
    expect(await (await importLabels(req('/x', post(items), a), params(zag))).json()).toEqual({ created: 3, updated: 0 });
    expect(await (await importLabels(req('/x', post(items), a), params(zag))).json()).toEqual({ created: 0, updated: 3 });
    const l = await prisma.label.findFirstOrThrow({ where: { sku: '1205' }, include: { extraLabel: true } });
    expect(l.extraLabel?.title).toBe('Частина 2 (серія 1200)');
    expect(l.barcode).toBe('4826077012052');
  });

  it('preview returns a one-page PDF', async () => {
    const l = await (await createLabel(req('/x', post({ sku: '0205', text: 'Пляшка' }), m), params(zag))).json();
    const r = await preview(req('/x', {}, m), params(l.id));
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
  });
});
