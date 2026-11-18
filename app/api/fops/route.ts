import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { Prisma } from '@prisma/client';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { createOurFopService } from '@/services/ourFops';

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return jsonResponse(await prisma.ourFop.findMany({ orderBy: { id: 'asc' } }));
});

const Fop = z.object({
  name: z.string().trim().min(2, 'Вкажіть назву ФОП'),
  requisites: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  isDefault: z.boolean().default(false),
  sdOrganizationId: z.number().int().positive().nullable().default(null),
});

async function setDefault(id: number, isDefault: boolean) {
  if (isDefault) await prisma.ourFop.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
}

/** Create our FOP — any signed-in user (managers too). */
export const POST = route(async (req: Request) => {
  await requireUser(req);
  const d = Fop.parse(await req.json());
  const fop = await prisma.ourFop.create({ data: d });
  await setDefault(fop.id, d.isDefault);
  return jsonResponse(fop, 201);
});

/** Partial update: only the fields sent are changed (no defaults, so a restore can't wipe requisites). */
const Patch = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(2, 'Вкажіть назву ФОП').optional(),
  requisites: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
  sdOrganizationId: z.number().int().positive().nullable().optional(),
});

/** Edit our FOP — any signed-in user; archiving/restoring (`archived`) is part of deletion → admin only. */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser(req);
  const { id, ...d } = Patch.parse(await req.json());
  if (d.archived !== undefined && user.role !== 'admin') throw new HttpError(403, 'Недостатньо прав');
  if (d.archived === false) await createOurFopService(prisma).restore(id);
  const fop = await prisma.ourFop.update({ where: { id }, data: d }).catch(e => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new HttpError(404, 'ФОП не знайдено');
    throw e;
  });
  await setDefault(id, !!d.isDefault);
  return jsonResponse(fop);
});
