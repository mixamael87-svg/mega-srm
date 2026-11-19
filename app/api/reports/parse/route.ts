import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { readSheetRows } from '@/reports/xls';
import { parseBagel } from '@/reports/bagel';
import { matchLines } from '@/reports/match';
import { ourName } from '@/reports/names';
import { createClientCodeService } from '@/services/clientCodes';
import { salesDrive } from '@/salesdrive/fromEnv';

const MAX = 5 * 1024 * 1024;

/** Upload a client report (multipart: clientId, file) → parsed, matched to our SKUs; learned codes are remembered. */
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
  const { matched, unmatched, learned, conflicts } = matchLines(report.lines, await codes.load(clientId));
  await codes.learn(clientId, learned);

  const names = new Map<string, string | null>();
  for (const sku of new Set(matched.map(m => m.sku))) names.set(sku, ourName(await salesDrive().listProductsBySku(sku).catch(() => [])));
  const { lines: _lines, ...meta } = report;
  return jsonResponse({ report: meta, matched: matched.map(m => ({ ...m, ourName: names.get(m.sku) ?? null })), unmatched, conflicts });
});
