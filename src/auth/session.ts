import { getIronSession, type SessionOptions } from 'iron-session';
import { prisma } from '../db/prisma';
import { HttpError } from '../http/errors';

export type SessionData = { userId?: number };
export type SessionUser = { id: number; login: string; role: 'admin' | 'manager' };

export const SESSION_COOKIE = 'srm_session';

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error('SESSION_SECRET must be set (>= 32 chars)');
  return {
    cookieName: SESSION_COOKIE,
    password,
    ttl: 60 * 60 * 24 * 14,
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
  };
}

/** Session bound to a Request/Response pair (route handlers). Changes are written into `res` on save(). */
export const getSession = (req: Request, res: Response) => getIronSession<SessionData>(req, res, sessionOptions());

async function loadUser(userId: number | undefined): Promise<SessionUser | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return u && u.active ? { id: u.id, login: u.login, role: u.role } : null;
}

/** Route handlers: current active user or 401; with role='admin' a manager gets 403. */
export async function requireUser(req: Request, role?: 'admin'): Promise<SessionUser> {
  const session = await getSession(req, new Response());
  const user = await loadUser(session.userId);
  if (!user) throw new HttpError(401, 'Потрібно увійти');
  if (role === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Недостатньо прав');
  return user;
}

/** Server components: current user from next/headers cookies, or null. */
export async function getPageUser(): Promise<SessionUser | null> {
  const { cookies } = await import('next/headers');
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions());
  return loadUser(session.userId);
}
