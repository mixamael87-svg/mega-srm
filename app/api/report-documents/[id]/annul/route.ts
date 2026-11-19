import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { createReportDocumentService } from '@/services/reportDocuments';

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  await createReportDocumentService(prisma).annul(intParam((await ctx.params).id));
  return jsonResponse({ ok: true });
});
