import type { SdOrder, SdOrderLine, SdProduct } from '../domain/types';
import type { SalesDriveClient } from './client';

/**
 * Demo data shaped like order 54969 (68 lines, first line "Ніблер (Мікс)" ×24 with 4 colours).
 * Synthetic: names/prices are illustrative, not the real order.
 */
export function createMockSalesDrive(): SalesDriveClient {
  const lines: SdOrderLine[] = [
    { productId: 1, parameter: 'id_1', sku: '0001', name: 'Ніблер (Мікс) (0001)', amount: 24, price: 45, discount: 0, percentDiscount: 0 },
  ];
  for (let i = 2; i <= 68; i++) {
    const sku = String(100 + i).padStart(4, '0');
    lines.push({ productId: i, parameter: `p${i}`, sku, name: `Товар демо ${sku}`, amount: (i % 5) + 1, price: 10 + i * 1.5, discount: 0, percentDiscount: 0 });
  }
  const paymentAmount = lines.reduce((s, l) => s + Math.round(l.amount * Math.round(l.price * 100)), 0) / 100;
  const orders: Record<number, SdOrder> = {
    54969: { id: 54969, orderTime: '2026-11-12 11:20:00', contactId: 40001, contactName: 'Демо Клієнт', organizationId: null, discountAmount: 0, paymentAmount, lines },
  };
  const catalog: SdProduct[] = [
    { id: 'id_1', sku: '0001', name: 'Ніблер (Мікс) (0001)', inStock: 0 },
    { id: 'c1', sku: '0001', name: 'Ніблер (рожевий)', inStock: 40 },
    { id: 'c2', sku: '0001', name: 'Ніблер (блакитний)', inStock: 35 },
    { id: 'c3', sku: '0001', name: 'Ніблер (зелений)', inStock: 12 },
    { id: 'c4', sku: '0001', name: 'Ніблер (бузковий)', inStock: 8 },
  ];
  return {
    getOrder: async id => orders[id] ?? null,
    listProductsBySku: async sku => catalog.filter(p => p.sku === sku),
    listOrganizations: async () => [{ id: 1, title: 'ФОП Демо Постачальник', egrpou: '1234567890', iban: 'UA000000000000000000000000000' }],
  };
}
