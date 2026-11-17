import { z } from 'zod';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { labelService } from '@/services';

/** Label sets with label counts (all signed-in users). */
export const GET = route(async (req: Request) => {
  await requireUser(req);
  return jsonResponse(await labelService().listSets());
});

export const POST = route(async (req: Request) => {
  await requireUser(req);
  return jsonResponse(await labelService().createSet(z.object({ name: z.string() }).parse(await req.json()).name), 201);
});
