import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { labelService } from '@/services';

/** GET ?set=<id> — editable print list of an active nakladna for one label set. */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const setId = intParam(new URL(req.url).searchParams.get('set') ?? '', 'Оберіть набір наклейок');
  return jsonResponse(await labelService().rowsForDocument(intParam((await ctx.params).id), setId));
});
