import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/auth/session';

/** Coarse gate: no session → /login (pages) or 401 (API). Role and "active" checks happen in handlers. */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions());
  if (session.userId) return res;
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Потрібно увійти' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!login|api/auth|_next|favicon.ico).*)'] };
