/**
 * SalesDrive API client (read-only: GET only, never writes to SalesDrive).
 *
 * Endpoints (checked 2026-11-17, https://salesdrive.ua/knowledge/api/):
 *  - GET {baseUrl}/api/order/list/?filter[id]=…&filter[statusId]=__ALL__   orders; limit 10 req/min, 100/h, 1000/day
 *  - GET {baseUrl}/api/invoice/list/, /api/sales-invoice/list/             documents (carry `organization`, `organizationAccount`)
 *  - Product catalog: there is NO product list API — SalesDrive exposes it as a YML export link
 *    (Установки → Товари/Послуги → Експорт YML, env SALESDRIVE_YML_URL; robots.txt blocks crawlers,
 *    server-side fetch is fine). We read that feed and cache it for 10 minutes.
 *  - There is NO organizations endpoint: organizations are collected from documents; the rest is entered in the app.
 * Auth: docs name the header `Form-Api-Key`; the owner's working integration uses `X-Api-Key` — we send both.
 * `filter[id]` is not in the public docs: getOrder() therefore also matches the id in the response,
 * so an ignored filter yields "not found" instead of a wrong order. Verify with scripts/sd-smoke.ts.
 */
import type { SdOrder, SdProduct } from '../domain/types';
import { mapOrder } from './mapOrder';

export class SalesDriveError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'SalesDriveError';
  }
}

export type SalesDriveConfig = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  /** YML export link of the product catalog. Without it Mix split has no variants. */
  catalogYmlUrl?: string;
  now?: () => number;
};

export type SdOrganization = { id: number; title: string; egrpou: string; iban: string };

const CATALOG_TTL_MS = 10 * 60 * 1000;

export function createSalesDriveClient(cfg: SalesDriveConfig) {
  const f = cfg.fetch ?? fetch;
  const now = cfg.now ?? Date.now;
  const base = cfg.baseUrl.replace(/\/+$/, '');
  let catalog: { at: number; items: SdProduct[] } | null = null;

  async function getText(url: string, withKey: boolean): Promise<string> {
    let res: Response;
    try {
      res = await f(url, { method: 'GET', headers: withKey ? { 'X-Api-Key': cfg.apiKey, 'Form-Api-Key': cfg.apiKey, Accept: 'application/json' } : {} });
    } catch (e) {
      throw new SalesDriveError(`SalesDrive недоступний: ${(e as Error).message}`, 0);
    }
    const text = await res.text();
    if (res.status === 429) throw new SalesDriveError('Забагато запитів до SalesDrive, спробуйте за хвилину', 429);
    if (res.status === 401 || res.status === 403) throw new SalesDriveError('SalesDrive відхилив API-ключ', res.status);
    if (!res.ok) throw new SalesDriveError(`Помилка SalesDrive (HTTP ${res.status})`, res.status);
    return text;
  }

  async function getJson(path: string, params: Record<string, string | number>): Promise<any> {
    const u = new URL(base + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const text = await getText(u.toString(), true);
    let body: any;
    try { body = JSON.parse(text); } catch { throw new SalesDriveError('SalesDrive повернув некоректну відповідь', 502); }
    if (body?.status === 'error' || body?.success === false) throw new SalesDriveError(`Помилка SalesDrive: ${body.message ?? 'невідома'}`, 502);
    return body;
  }

  async function loadCatalog(): Promise<SdProduct[]> {
    if (!cfg.catalogYmlUrl) return [];
    if (catalog && now() - catalog.at <= CATALOG_TTL_MS) return catalog.items;
    const items = parseYmlOffers(await getText(cfg.catalogYmlUrl, false));
    catalog = { at: now(), items };
    return items;
  }

  return {
    async getOrder(id: number): Promise<SdOrder | null> {
      if (!Number.isSafeInteger(id) || id <= 0) return null;
      const body = await getJson('/api/order/list/', { 'filter[id]': id, 'filter[statusId]': '__ALL__', page: 1, limit: 100 });
      const found = (body.data ?? body.orders ?? []).find((o: any) => Number(o?.id) === id);
      return found ? mapOrder(found) : null;
    },

    async listProductsBySku(sku: string): Promise<SdProduct[]> {
      const s = sku.trim();
      if (!s) return [];
      return (await loadCatalog()).filter(p => p.sku === s);
    },

    async listOrganizations(): Promise<SdOrganization[]> {
      const byId = new Map<number, SdOrganization>();
      for (const path of ['/api/invoice/list/', '/api/sales-invoice/list/']) {
        for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
          const body = await getJson(path, { page, limit: 100 });
          pages = Number(body.pagination?.pageCount ?? 1);
          for (const d of body.data ?? []) {
            const o = d?.organization;
            if (!o?.id || byId.has(Number(o.id))) continue;
            byId.set(Number(o.id), { id: Number(o.id), title: String(o.title ?? ''), egrpou: String(o.egrpou ?? ''), iban: String(d.organizationAccount?.accountNumber ?? '') });
          }
        }
      }
      return [...byId.values()].sort((a, b) => a.id - b.id);
    },
  };
}

export type SalesDriveClient = ReturnType<typeof createSalesDriveClient>;

const decodeXml = (s: string): string => {
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1]!.trim();
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .trim();
};

/**
 * Minimal YML parser for the SalesDrive export (format checked on the real feed, 2026-11-17):
 * <offer id="893720631" available="true"><name>…</name><quantity_in_stock>527</quantity_in_stock>
 *   <vendorCode>0907</vendorCode><article>0907</article></offer>
 * Offer id is a STRING and equals SalesDrive product `parameter` (not productId); ~17% look like "id_2022".
 * Offers without vendorCode/article are skipped.
 */
export function parseYmlOffers(xml: string): SdProduct[] {
  const out: SdProduct[] = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const id = decodeXml(m[1]!.match(/\bid="([^"]+)"/)?.[1] ?? '');
    const tag = (t: string) => { const r = m[2]!.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return r ? decodeXml(r[1]!) : ''; };
    const sku = tag('vendorCode') || tag('article');
    if (!id || !sku) continue;
    const p: SdProduct = { id, sku, name: tag('name') };
    const stock = tag('quantity_in_stock');
    if (stock !== '' && Number.isFinite(Number(stock))) p.inStock = Number(stock);
    out.push(p);
  }
  return out;
}
