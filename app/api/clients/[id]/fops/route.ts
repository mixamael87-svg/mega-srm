import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { createClientService } from '@/services/clients';

const Body = z.object({ name: z.string(), requisites: z.string() });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const clientId = intParam((await ctx.params).id);
  return jsonResponse(await createClientService(prisma).addFop(clientId, Body.parse(await req.json())), 201);
});
