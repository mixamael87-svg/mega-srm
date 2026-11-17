import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { createClientService } from '@/services/clients';

/** Numbers for the delete warning: { fops, documents }. */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  return jsonResponse(await createClientService(prisma).usage(intParam((await ctx.params).id)));
});
