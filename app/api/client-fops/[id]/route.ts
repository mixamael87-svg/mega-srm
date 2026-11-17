import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { createClientService } from '@/services/clients';

const Body = z.object({ name: z.string().optional(), requisites: z.string().optional(), archived: z.boolean().optional() });

/** Edit a recipient FOP or move it to / back from the archive. */
export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const id = intParam((await ctx.params).id);
  return jsonResponse(await createClientService(prisma).updateFop(id, Body.parse(await req.json())));
});
