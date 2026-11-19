import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { ourName } from '@/reports/names';
import { createClientCodeService } from '@/services/clientCodes';
import { salesDrive } from '@/salesdrive/fromEnv';

const Body = z.object({ clientId: z.number().int().positive(), code: z.string(), sku: z.string() });

/** Map a client's code to our SKU by hand (remembered for this client). */
export const POST = route(async (req: Request) => {
  await requireUser(req);
  const b = Body.parse(await req.json());
  await createClientCodeService(prisma).setManual(b.clientId, b.code, b.sku);
  const sku = b.sku.trim();
  return jsonResponse({ sku, ourName: ourName(await salesDrive().listProductsBySku(sku).catch(() => [])) });
});

/** Forget a mapping — admin only. */
export const DELETE = route(async (req: Request) => {
  await requireUser(req, 'admin');
  const p = new URL(req.url).searchParams;
  await createClientCodeService(prisma).remove(Number(p.get('clientId')), p.get('code') ?? '');
  return jsonResponse({ ok: true });
});
