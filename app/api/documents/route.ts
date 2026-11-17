import { z } from 'zod';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { xlsxResponse } from '@/http/params';
import { documentService } from '@/services';
import { parseDocDate } from '@/services/documents';

export const GET = route(async (req: Request) => {
  await requireUser(req);
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return jsonResponse(await documentService().listDocuments({ q }));
});

const Body = z.object({
  type: z.enum(['RAHUNOK', 'NAKLADNA']),
  sdOrderId: z.number().int().positive(),
  fopId: z.number().int().positive(),
  recipientFopId: z.number().int().positive().optional(),
  date: z.string(),
  splits: z.array(z.object({ lineIndex: z.number().int().min(0), parts: z.array(z.object({ variantId: z.string().min(1), qty: z.number().min(0) })) })).default([]),
});

/**
 * Generate (or regenerate) a document. Returns the .xlsx file, or — with `Accept: application/json` —
 * `{ documentId, number, filename }` so the browser can download it via GET /api/documents/:id/file
 * (a plain link keeps the Cyrillic filename from Content-Disposition; blob downloads may lose it).
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const b = Body.parse(await req.json());
  const r = await documentService().generateDocument({ ...b, date: parseDocDate(b.date), userId: user.id });
  if ((req.headers.get('accept') ?? '').includes('application/json')) return jsonResponse({ documentId: r.documentId, number: r.number, filename: r.filename });
  return xlsxResponse(r.file, r.filename);
});
