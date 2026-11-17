import { requireUser } from '@/auth/session';
import { route } from '@/http/errors';
import { intParam, xlsxResponse } from '@/http/params';
import { documentService } from '@/services';

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const r = await documentService().downloadDocument(intParam((await ctx.params).id));
  return xlsxResponse(r.file, r.filename);
});
