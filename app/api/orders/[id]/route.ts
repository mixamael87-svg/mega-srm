import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { intParam } from '@/http/params';
import { salesDrive } from '@/salesdrive/fromEnv';
import { isMixLine } from '@/domain/buildDocument';

/** Order preview for the "Новий документ" screen: lines, recipient requisites, colour variants of Mix lines, defaults. */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const id = intParam((await ctx.params).id, 'Введіть номер замовлення');
  const sd = salesDrive();
  const order = await sd.getOrder(id);
  if (!order) throw new HttpError(404, `Замовлення № ${id} не знайдено в SalesDrive`, 'ORDER_NOT_FOUND');

  const mix = await Promise.all(order.lines.map(async (l, i) => {
    if (!isMixLine(l.name)) return null;
    const colours = (await sd.listProductsBySku(l.sku)).filter(v => v.id !== l.parameter && !isMixLine(v.name));
    return colours.length ? { lineIndex: i, colours } : null;
  }));

  const [recipient, fops, docs] = await Promise.all([
    prisma.clientFop.findUnique({ where: { sdContactId: order.contactId } }),
    prisma.ourFop.findMany({ orderBy: { id: 'asc' } }),
    prisma.document.findMany({ where: { sdOrderId: id }, select: { id: true, type: true, number: true, status: true } }),
  ]);
  const defaultFop = fops.find(f => order.organizationId != null && f.sdOrganizationId === order.organizationId) ?? fops.find(f => f.isDefault) ?? fops[0];

  return jsonResponse({
    order,
    recipient,
    mix: mix.filter(Boolean),
    fops: fops.map(f => ({ id: f.id, name: f.name })),
    defaultFopId: defaultFop?.id ?? null,
    defaultDate: order.orderTime.slice(0, 10),
    documents: docs,
  });
});
