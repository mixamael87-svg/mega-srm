import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { createClientService } from '@/services/clients';

const Body = z.object({ name: z.string().optional(), phone: z.string().optional(), comment: z.string().optional() });

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const id = intParam((await ctx.params).id);
  return jsonResponse(await createClientService(prisma).updateClient(id, Body.parse(await req.json())));
});
