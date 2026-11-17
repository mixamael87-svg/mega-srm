import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { labelService } from '@/services';
import { LabelBody } from '@/labels/schema';

type Ctx = { params: Promise<{ id: string }> };

/** Labels of a set: GET ?q=… (sku, title or text). */
export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireUser(req);
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return jsonResponse(await labelService().listLabels(intParam((await ctx.params).id), q));
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser(req);
  const body = LabelBody.parse(await req.json());
  return jsonResponse(await labelService().createLabel(intParam((await ctx.params).id), { ...body, extraLabelId: body.extraLabelId ?? null }), 201);
});
