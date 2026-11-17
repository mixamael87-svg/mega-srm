import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { verifyPassword } from '@/auth/password';
import { getSession } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';

const Body = z.object({ login: z.string().trim().min(1), password: z.string().min(1) });
const BAD = 'Невірний логін або пароль';

export const POST = route(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(401, BAD);
  const user = await prisma.user.findUnique({ where: { login: parsed.data.login } });
  if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) throw new HttpError(401, BAD);
  const res = jsonResponse({ id: user.id, login: user.login, role: user.role });
  const session = await getSession(req, res);
  session.userId = user.id;
  await session.save();
  return res;
});
