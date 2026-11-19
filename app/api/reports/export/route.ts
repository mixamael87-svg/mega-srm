import { z } from 'zod';
import { requireUser } from '@/auth/session';
import { route } from '@/http/errors';
import { xlsxResponse } from '@/http/params';
import { exportReportXlsx } from '@/reports/exportXlsx';

const Body = z.object({
  meta: z.object({ client: z.string(), title: z.string(), kind: z.enum(['turnover', 'stock']), dateFrom: z.string().nullable(), dateTo: z.string(), store: z.string() }),
  rows: z.array(z.object({
    sku: z.string(), name: z.string(), priceKop: z.number().int(), qty: z.number(),
    opening: z.number(), incoming: z.number(), soldRetail: z.number(), soldOther: z.number(), newPriceKop: z.number().int().nullable().optional(),
  })).max(10000),
});

export const POST = route(async (req: Request) => {
  await requireUser(req);
  const b = Body.parse(await req.json());
  const safe = b.meta.client.replace(/[\\/:*?"<>|]/g, '').trim() || 'Клієнт';
  return xlsxResponse(await exportReportXlsx(b.meta, b.rows), `Звіт_${safe}_${b.meta.dateTo}.xlsx`);
});
