import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';

const Body = z.object({
  sdContactId: z.number().int().positive(),
  name: z.string().trim().min(2, 'Вкажіть назву одержувача'),
  requisites: z.string().trim().min(5, 'Вкажіть реквізити одержувача'),
});

/** Save recipient requisites for a SalesDrive contact (used automatically next time). */
export const PUT = route(async (req: Request) => {
  await requireUser(req);
  const b = Body.parse(await req.json());
  const saved = await prisma.clientFop.upsert({ where: { sdContactId: b.sdContactId }, create: b, update: { name: b.name, requisites: b.requisites } });
  return jsonResponse(saved);
});
