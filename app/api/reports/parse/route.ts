import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { readSheetRows } from '@/reports/xls';
import { parseBagel } from '@/reports/bagel';
import { skuFromBarcode } from '@/reports/match';
import { ourName } from '@/reports/names';
import { createNameIndex } from '@/reports/suggest';
import { createClientCodeService } from '@/services/clientCodes';
import { salesDrive } from '@/salesdrive/fromEnv';
import type { RawLine } from '@/reports/types';

const MAX = 5 * 1024 * 1024;
type Source = 'barcode' | 'saved' | 'name' | null;

/**
 * Upload a client report (multipart: clientId, file). Every line gets our SKU and where it came from:
 * our barcode (exact) → a code saved for this client (exact) → a suggestion by name (to confirm) → none.
 * Codes seen with one consistent barcode are remembered. `catalog` maps SKU → our name for the UI.
 */
export const POST = route(async (req: Request) => {
  await requireUser(req);
  if (Number(req.headers.get('content-length') ?? 0) > MAX + 64 * 1024) throw new HttpError(413, 'Файл більший за 5 МБ');
  const form = await req.formData().catch(() => { throw new HttpError(400, 'Оберіть файл'); });
  const file = form.get('file');
  const clientId = Number(form.get('clientId'));
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, 'Оберіть файл');
  if (file.size > MAX) throw new HttpError(413, 'Файл більший за 5 МБ');
  if (!Number.isSafeInteger(clientId) || !(await prisma.client.findUnique({ where: { id: clientId } }))) throw new HttpError(404, 'Клієнта не знайдено');

  const report = parseBagel(readSheetRows(new Uint8Array(await file.arrayBuffer())));
  const codes = createClientCodeService(prisma);
  const saved = await codes.load(clientId);

  // learn codes whose rows all carry the same one of our barcodes
  const byBarcode = new Map<string, Set<string>>();
  for (const l of report.lines) { const s = skuFromBarcode(l.barcode); if (s) byBarcode.set(l.code, (byBarcode.get(l.code) ?? new Set()).add(s)); }
  const conflicts = [...byBarcode].filter(([, s]) => s.size > 1).map(([c]) => c);
  const learned = new Map([...byBarcode].filter(([c, s]) => s.size === 1 && saved.get(c) !== [...s][0]).map(([c, s]) => [c, [...s][0]!]));
  await codes.learn(clientId, learned);
  for (const [c, s] of learned) if (!saved.has(c)) saved.set(c, s);

  const products = await salesDrive().listProducts().catch(() => []);
  const index = createNameIndex(products);
  const suggestions = new Map<string, string | null>();
  const resolve = (l: RawLine): { sku: string | null; source: Source } => {
    const b = skuFromBarcode(l.barcode);
    if (b) return { sku: b, source: 'barcode' };
    const s = saved.get(l.code);
    if (s) return { sku: s, source: 'saved' };
    if (!suggestions.has(l.code)) suggestions.set(l.code, index.suggest(l.name)?.sku ?? null);
    const n = suggestions.get(l.code)!;
    return n ? { sku: n, source: 'name' } : { sku: null, source: null };
  };
  const lines = report.lines.map(l => ({ ...l, ...resolve(l) }));

  const bySku = new Map<string, typeof products>();
  for (const p of products) bySku.set(p.sku, [...(bySku.get(p.sku) ?? []), p]);
  const catalog: Record<string, string> = {};
  for (const [sku, ps] of bySku) { const n = ourName(ps); if (n) catalog[sku] = n; }

  const { lines: _raw, ...meta } = report;
  return jsonResponse({ report: meta, lines, conflicts, catalog });
});
