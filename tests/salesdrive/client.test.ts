import { describe, it, expect } from '../_vitest';
import { readFileSync } from 'node:fs';
import { createSalesDriveClient, SalesDriveError } from '../../src/salesdrive/client';

const raw = readFileSync(new URL('../fixtures/sd-order-raw.json', import.meta.url), 'utf8');
const yml = readFileSync(new URL('../fixtures/catalog.yml.xml', import.meta.url), 'utf8');

type Call = { url: string; headers: Record<string, string> };
function mockFetch(routes: (url: URL) => { status?: number; body: string }) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const r = routes(url);
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}
const cfg = (f: typeof fetch, extra = {}) => ({ baseUrl: 'https://mega.salesdrive.me', apiKey: 'KEY', fetch: f, ...extra });
const empty = JSON.stringify({ status: 'success', data: [], pagination: { currentPage: 1, pageCount: 0, perPage: 100 } });

describe('getOrder', () => {
  it('maps raw order 55225', async () => {
    const { f, calls } = mockFetch(() => ({ body: raw }));
    const o = await createSalesDriveClient(cfg(f)).getOrder(55225);
    expect(o).toEqual({
      id: 55225, orderTime: '2026-11-16 14:05:00', contactId: 43692, contactName: 'Палій Анна', organizationId: null,
      discountAmount: 0, paymentAmount: 167,
      lines: [
        { productId: 2947, parameter: '3209933633', sku: '0935', name: 'Заводна іграшка для купання "Кит" (синій)', amount: 1, price: 76, discount: 0, percentDiscount: 0 },
        { productId: 972, parameter: '1884550628', sku: '0919', name: 'Заводна іграшка для купання "Черепашка" (зелена)', amount: 1, price: 91, discount: 0, percentDiscount: 0 },
      ],
    });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe('/api/order/list/');
    expect(u.searchParams.get('filter[id]')).toBe('55225');
    expect(u.searchParams.get('filter[statusId]')).toBe('__ALL__');
    expect(calls[0]!.headers['x-api-key']).toBe('KEY');
    expect(calls[0]!.headers['form-api-key']).toBe('KEY');
  });
  it('empty list → null', async () => {
    const { f } = mockFetch(() => ({ body: empty }));
    expect(await createSalesDriveClient(cfg(f)).getOrder(1)).toBeNull();
  });
  it('ignores orders with other ids (filter not applied) → null', async () => {
    const { f } = mockFetch(() => ({ body: raw }));
    expect(await createSalesDriveClient(cfg(f)).getOrder(54969)).toBeNull();
  });
  it('invalid id → null without request', async () => {
    const { f, calls } = mockFetch(() => ({ body: raw }));
    const c = createSalesDriveClient(cfg(f));
    for (const id of [0, -5, 1.5, NaN]) expect(await c.getOrder(id)).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('HTTP 401 → SalesDriveError(401)', async () => {
    const { f } = mockFetch(() => ({ status: 401, body: '{"status":"error","message":"bad key"}' }));
    await expect(createSalesDriveClient(cfg(f)).getOrder(5)).rejects.toThrow((e: unknown) => e instanceof SalesDriveError && e.status === 401);
  });
  it('HTTP 429 → readable message', async () => {
    const { f } = mockFetch(() => ({ status: 429, body: '' }));
    await expect(createSalesDriveClient(cfg(f)).getOrder(5)).rejects.toThrow('Забагато запитів до SalesDrive');
  });
  it('status:error in 200 body → SalesDriveError', async () => {
    const { f } = mockFetch(() => ({ body: '{"status":"error","message":"Access denied"}' }));
    await expect(createSalesDriveClient(cfg(f)).getOrder(5)).rejects.toThrow('Access denied');
  });
  it('baseUrl with trailing slash', async () => {
    const { f, calls } = mockFetch(() => ({ body: empty }));
    await createSalesDriveClient(cfg(f, { baseUrl: 'https://mega.salesdrive.me/' })).getOrder(7);
    expect(new URL(calls[0]!.url).pathname).toBe('/api/order/list/');
  });
});

describe('listProductsBySku (YML catalog)', () => {
  it('real export format: string ids (= SalesDrive product `parameter`), exact sku match', async () => {
    const { f } = mockFetch(() => ({ body: yml }));
    const c = createSalesDriveClient(cfg(f, { catalogYmlUrl: 'https://mega.salesdrive.me/export/yml/x.yml' }));
    expect(await c.listProductsBySku('0907')).toEqual([
      { id: '893720631', sku: '0907', name: 'Шапочка для купання "Тварини" (рожева)', inStock: 527 },
      { id: 'id_2022', sku: '0907', name: 'Шапочка для купання "Тварини" (Мікс)', inStock: 0 },
      { id: '893724066', sku: '0907', name: 'Шапочка для купання "Тварини" (зелена)', inStock: 10 },
      { id: '893724169', sku: '0907', name: 'Шапочка для купання "Тварини" (жовта)', inStock: 2 },
    ]);
    expect(await c.listProductsBySku('PL20')).toHaveLength(1);
    expect(await c.listProductsBySku('9999')).toEqual([]);
    expect(await c.listProductsBySku('')).toEqual([]);
  });
  it('decodes entities and CDATA', async () => {
    const { f } = mockFetch(() => ({ body: yml }));
    const c = createSalesDriveClient(cfg(f, { catalogYmlUrl: 'https://x/y.yml' }));
    expect((await c.listProductsBySku('9998')).map(p => p.name)).toEqual(['Тримач & ланцюжок "А"', 'Тримач <нов> & "Б"']);
  });
  it('caches the catalog for 10 minutes', async () => {
    let now = 0;
    const { f, calls } = mockFetch(() => ({ body: yml }));
    const c = createSalesDriveClient(cfg(f, { catalogYmlUrl: 'https://x/y.xml', now: () => now }));
    await c.listProductsBySku('0907'); await c.listProductsBySku('0919');
    expect(calls).toHaveLength(1);
    now = 10 * 60 * 1000 + 1;
    await c.listProductsBySku('0907');
    expect(calls).toHaveLength(2);
  });
  it('no catalog configured → empty list (split unavailable)', async () => {
    const { f, calls } = mockFetch(() => ({ body: yml }));
    expect(await createSalesDriveClient(cfg(f)).listProductsBySku('0907')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('listOrganizations', () => {
  it('collects unique organizations from invoice and sales-invoice documents', async () => {
    const doc = (orgId: number, title: string, iban: string) => ({ organization: { id: orgId, egrpou: '33' + orgId, title }, organizationAccount: { id: 1, title: 't', accountNumber: iban } });
    const { f, calls } = mockFetch((u) => {
      if (u.pathname === '/api/invoice/list/') return { body: JSON.stringify({ status: 'success', data: [doc(1, 'ФОП Ольховский', 'UA41'), { organization: null }], pagination: { currentPage: 1, pageCount: 1, perPage: 100 } }) };
      if (u.pathname === '/api/sales-invoice/list/') return { body: JSON.stringify({ status: 'success', data: [doc(1, 'ФОП Ольховский', 'UA41'), doc(2, 'ФОП Кузнецов', 'UA99')], pagination: { currentPage: 1, pageCount: 1, perPage: 100 } }) };
      return { status: 404, body: '' };
    });
    const orgs = await createSalesDriveClient(cfg(f)).listOrganizations();
    expect(orgs).toEqual([
      { id: 1, title: 'ФОП Ольховский', egrpou: '331', iban: 'UA41' },
      { id: 2, title: 'ФОП Кузнецов', egrpou: '332', iban: 'UA99' },
    ]);
    expect(calls.every(c => c.headers['x-api-key'] === 'KEY')).toBe(true);
  });
});
