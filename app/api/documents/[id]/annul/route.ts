import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { documentService } from '@/services';

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); // managers may annul too (owner, 18.11)
  await documentService().annulDocument(intParam((await ctx.params).id), user.id);
  return jsonResponse({ ok: true });
});
