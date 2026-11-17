import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { createOurFopService } from '@/services/ourFops';

/** Usage for the delete warning: { documents }. */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req, 'admin');
  return jsonResponse(await createOurFopService(prisma).usage(intParam((await ctx.params).id)));
});

/** Admin: delete for good if the FOP has no documents, otherwise archive it. */
export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req, 'admin');
  return jsonResponse(await createOurFopService(prisma).remove(intParam((await ctx.params).id)));
});
