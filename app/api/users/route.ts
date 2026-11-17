import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';
import { hashPassword } from '@/auth/password';
import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';

const select = { id: true, login: true, role: true, active: true, createdAt: true } as const;

export const GET = route(async (req: Request) => {
  await requireUser(req, 'admin');
  return jsonResponse(await prisma.user.findMany({ select, orderBy: { id: 'asc' } }));
});

const Create = z.object({
  login: z.string().trim().min(2, 'Логін: мінімум 2 символи').max(50),
  password: z.string().min(8, 'Пароль: мінімум 8 символів'),
  role: z.enum(['admin', 'manager']).default('manager'),
});

export const POST = route(async (req: Request) => {
  await requireUser(req, 'admin');
  const data = Create.parse(await req.json());
  try {
    const user = await prisma.user.create({ data: { login: data.login, role: data.role, passwordHash: await hashPassword(data.password) }, select });
    return jsonResponse(user, 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new HttpError(409, 'Такий логін вже існує');
    throw e;
  }
});

const Update = z.object({ id: z.number().int(), active: z.boolean().optional(), role: z.enum(['admin', 'manager']).optional(), password: z.string().min(8).optional() });

export const PATCH = route(async (req: Request) => {
  const me = await requireUser(req, 'admin');
  const d = Update.parse(await req.json());
  if (d.id === me.id && (d.active === false || d.role === 'manager')) throw new HttpError(400, 'Не можна вимкнути або понизити себе');
  const user = await prisma.user.update({
    where: { id: d.id },
    data: { active: d.active, role: d.role, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) },
    select,
  });
  return jsonResponse(user);
});
