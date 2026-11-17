import type { SdOrder } from '../domain/types';

const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown): string => (v == null ? '' : String(v));

/** Raw item of /api/order/list/ `data[]` → SdOrder. */
export function mapOrder(raw: any): SdOrder {
  const c = raw.primaryContact ?? raw.contacts?.[0] ?? {};
  const contactName = [c.lName, c.fName].map(str).map(s => s.trim()).filter(Boolean).join(' ') || str(c.company).trim();
  return {
    id: num(raw.id),
    orderTime: str(raw.orderTime),
    contactId: num(c.id),
    contactName,
    organizationId: raw.organizationId == null ? null : num(raw.organizationId),
    discountAmount: num(raw.discountAmount),
    paymentAmount: num(raw.paymentAmount),
    lines: (raw.products ?? []).map((p: any) => ({
      productId: num(p.productId),
      parameter: str(p.parameter).trim(),
      sku: str(p.sku).trim(),
      name: str(p.text ?? p.name).trim(),
      amount: num(p.amount),
      price: num(p.price),
      discount: num(p.discount),
      percentDiscount: num(p.percentDiscount),
    })),
  };
}
