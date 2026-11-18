import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { salesDrive } from '@/salesdrive/fromEnv';
import { labelService } from '@/services';

/** GET ?set=<id> — editable print list straight from a SalesDrive order (no document needed). */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const id = intParam((await ctx.params).id, 'Введіть номер замовлення');
  const setId = intParam(new URL(req.url).searchParams.get('set') ?? '', 'Оберіть набір наклейок');
  const svc = labelService();
  await svc.getSet(setId); // 404 for an unknown set before spending a SalesDrive request
  const order = await salesDrive().getOrder(id);
  if (!order) throw new HttpError(404, `Замовлення № ${id} не знайдено в SalesDrive`, 'ORDER_NOT_FOUND');
  return jsonResponse(await svc.rowsForOrder(id, order.lines, setId));
});
