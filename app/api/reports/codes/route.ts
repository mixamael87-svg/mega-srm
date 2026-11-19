import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { ourName } from '@/reports/names';
import { createClientCodeService } from '@/services/clientCodes';
import { salesDrive } from '@/salesdrive/fromEnv';

const Body = z.object({ clientId: z.number().int().positive(), items: z.array(z.object({ code: z.string(), sku: z.string() })).min(1).max(5000) });

/** Save client code → our SKU by hand (one or many at once); remembered for this client. */
export const POST = route(async (req: Request) => {
  await requireUser(req);
  const b = Body.parse(await req.json());
  if (b.items.some(it => !/^\d{4}$/.test(it.sku.trim()) || !it.code.trim())) throw new HttpError(400, 'Артикул — 4 цифри'); // all-or-nothing
  const svc = createClientCodeService(prisma);
  for (const it of b.items) await svc.setManual(b.clientId, it.code, it.sku);
  const products = await salesDrive().listProducts().catch(() => []);
  return jsonResponse({ items: b.items.map(it => { const sku = it.sku.trim(); return { code: it.code.trim(), sku, ourName: ourName(products.filter(p => p.sku === sku)) }; }) });
});

/** Forget a mapping — admin only. */
export const DELETE = route(async (req: Request) => {
  await requireUser(req, 'admin');
  const p = new URL(req.url).searchParams;
  await createClientCodeService(prisma).remove(Number(p.get('clientId')), p.get('code') ?? '');
  return jsonResponse({ ok: true });
});
