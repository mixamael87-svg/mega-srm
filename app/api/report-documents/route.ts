import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { xlsxResponse } from '@/http/params';
import { parseDocDate } from '@/services/documents';
import { createReportDocumentService } from '@/services/reportDocuments';

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return jsonResponse(await createReportDocumentService(prisma).list());
});

const PartyZ = z.object({ type: z.enum(['our', 'client']), id: z.number().int().positive() });
const Body = z.object({
  kind: z.enum(['POVERNENNYA', 'PEREOTSINKA']),
  number: z.number().int(),
  date: z.string(),
  supplier: PartyZ,
  recipient: PartyZ,
  clientId: z.number().int().positive(),
  lines: z.array(z.object({ sku: z.string().regex(/^\d{4}$/), name: z.string().min(1), qty: z.number(), priceKop: z.number().int() })).max(5000),
  allowDuplicate: z.boolean().optional(),
});

/** Create a revaluation document. JSON `{ id, number, filename }` with Accept: application/json, otherwise the .xlsx. */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const b = Body.parse(await req.json());
  const r = await createReportDocumentService(prisma).create({ ...b, date: parseDocDate(b.date), userId: user.id });
  if ((req.headers.get('accept') ?? '').includes('application/json')) return jsonResponse({ id: r.id, number: r.number, filename: r.filename });
  return xlsxResponse(r.file, r.filename);
});
