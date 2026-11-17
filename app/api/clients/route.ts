import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { createClientService } from '@/services/clients';

/** Clients directory (all signed-in users): GET ?q=…&archived=1 */
export const GET = route(async (req: Request) => {
  await requireUser(req);
  const p = new URL(req.url).searchParams;
  return jsonResponse(await createClientService(prisma).listClients({ q: p.get('q') ?? undefined, includeArchived: p.get('archived') === '1' }));
});

const Body = z.object({
  name: z.string(),
  phone: z.string().optional(),
  comment: z.string().optional(),
  fop: z.object({ name: z.string(), requisites: z.string() }).optional(),
});

export const POST = route(async (req: Request) => {
  await requireUser(req);
  return jsonResponse(await createClientService(prisma).createClient(Body.parse(await req.json())), 201);
});
