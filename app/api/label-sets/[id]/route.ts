import { z } from 'zod';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { labelService } from '@/services';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser(req);
  const { name } = z.object({ name: z.string() }).parse(await req.json());
  return jsonResponse(await labelService().renameSet(intParam((await ctx.params).id), name));
});

/** Delete a set with all its labels — admin only. */
export const DELETE = route(async (req: Request, ctx: Ctx) => {
  await requireUser(req, 'admin');
  await labelService().deleteSet(intParam((await ctx.params).id));
  return jsonResponse({ ok: true });
});
