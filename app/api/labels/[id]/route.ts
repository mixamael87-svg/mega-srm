import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { labelService } from '@/services';
import { LabelBody } from '@/labels/schema';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser(req);
  return jsonResponse(await labelService().updateLabel(intParam((await ctx.params).id), LabelBody.parse(await req.json())));
});

/** Delete a label for good — admin only. */
export const DELETE = route(async (req: Request, ctx: Ctx) => {
  await requireUser(req, 'admin');
  await labelService().deleteLabel(intParam((await ctx.params).id));
  return jsonResponse({ ok: true });
});
