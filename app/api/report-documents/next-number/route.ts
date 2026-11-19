import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { parseDocDate } from '@/services/documents';
import { createReportDocumentService } from '@/services/reportDocuments';

const Q = z.object({ kind: z.enum(['POVERNENNYA', 'PEREOTSINKA']), fopId: z.coerce.number().int().positive(), date: z.string() });

export const GET = route(async (req: Request) => {
  await requireUser(req);
  const q = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return jsonResponse({ number: await createReportDocumentService(prisma).nextNumber(q.kind, q.fopId, parseDocDate(q.date)) });
});
