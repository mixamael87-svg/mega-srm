import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { labelService } from '@/services';
import { ImportBody } from '@/labels/schema';

/** Bulk upsert of labels into a set (one-off migration from BarTender) — admin only. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req, 'admin');
  const items = ImportBody.parse(await req.json()).map(i => ({ ...i, extraLabelId: undefined }));
  return jsonResponse(await labelService().importLabels(intParam((await ctx.params).id), items));
});
