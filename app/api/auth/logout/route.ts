import { getSession } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';

export const POST = route(async (req: Request) => {
  const res = jsonResponse({ ok: true });
  (await getSession(req, res)).destroy();
  return res;
});
