import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { route } from '@/http/errors';
import { intParam, xlsxResponse } from '@/http/params';
import { createReportDocumentService } from '@/services/reportDocuments';

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const r = await createReportDocumentService(prisma).download(intParam((await ctx.params).id));
  return xlsxResponse(r.file, r.filename);
});
