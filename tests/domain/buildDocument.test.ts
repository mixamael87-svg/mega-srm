import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isMixLine, buildDocumentLines, DocumentBuildError } from '../../src/domain/buildDocument';
import type { SdOrder, SdOrderLine, SdProduct } from '../../src/domain/types';

const line = (p: Partial<SdOrderLine>): SdOrderLine => ({ productId: 1, parameter: 'p1', sku: '0001', name: 'Товар', amount: 1, price: 10, discount: 0, percentDiscount: 0, ...p });
const order = (lines: SdOrderLine[], o: Partial<SdOrder> = {}): SdOrder => {
  const total = lines.reduce((s, l) => s + Math.round(l.amount * Math.round(l.price * 100)), 0) / 100;
  return { id: 1, orderTime: '2026-11-12 10:00:00', contactId: 1, contactName: 'X', organizationId: null, lines, discountAmount: 0, paymentAmount: total, ...o };
};
const caught = (fn: () => unknown): DocumentBuildError => {
  try { fn(); } catch (e) { if (e instanceof DocumentBuildError) return e; throw e; }
  throw new Error('expected DocumentBuildError');
};

const mixOrder = () => order([
  line({ productId: 10, sku: '0100', name: 'Пустушка', amount: 2, price: 30 }),
  line({ productId: 20, parameter: 'id_20', sku: '0001', name: 'Ніблер (Мікс) (0001)', amount: 24, price: 45 }),
  line({ productId: 30, sku: '0102', name: 'Тримач для пустушки', amount: 1, price: 50 }),
]);
const nibVariants: Record<string, SdProduct[]> = {
  '0001': [
    { id: 'id_20', sku: '0001', name: 'Ніблер (Мікс) (0001)' },
    { id: 'v21', sku: '0001', name: 'Ніблер (рожевий)' },
    { id: 'v22', sku: '0001', name: 'Ніблер (блакитний)' },
    { id: 'v23', sku: '0001', name: 'Ніблер (зелений)' },
    { id: 'v24', sku: '0001', name: 'Ніблер (бузковий)' },
  ],
};

describe('isMixLine', () => {
  it('detects mix in any case', () => {
    expect(isMixLine('Ніблер (Мікс) (0001)')).toBe(true);
    expect(isMixLine('Пустушка (мікс) 0+')).toBe(true);
    expect(isMixLine('Брязкальце Мікс (0605)')).toBe(true);
    expect(isMixLine('Тримач для пустушки')).toBe(false);
  });
});

describe('buildDocumentLines', () => {
  it('maps 1:1 without splits', () => {
    const { lines, totals } = buildDocumentLines(mixOrder(), [], {});
    expect(lines).toHaveLength(3);
    expect(lines.map(l => l.no)).toEqual([1, 2, 3]);
    expect(lines[1]).toEqual({ no: 2, sku: '0001', name: 'Ніблер (Мікс) (0001)', barcode: '4826077000011', qty: 24, priceKop: 4500, sumKop: 108000 });
    expect(totals).toEqual({ grossKop: 6000 + 108000 + 5000, discountKop: 0, netKop: 119000 });
  });

  it('replaces a mix line with its variants in place', () => {
    const splits = [{ lineIndex: 1, parts: ['v21', 'v22', 'v23', 'v24'].map(variantId => ({ variantId, qty: 6 })) }];
    const { lines, totals } = buildDocumentLines(mixOrder(), splits, nibVariants);
    expect(lines).toHaveLength(6);
    expect(lines.map(l => l.no)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lines.slice(1, 5).map(l => l.name)).toEqual(['Ніблер (рожевий)', 'Ніблер (блакитний)', 'Ніблер (зелений)', 'Ніблер (бузковий)']);
    expect(lines[1]).toMatchObject({ sku: '0001', qty: 6, priceKop: 4500, sumKop: 27000, barcode: '4826077000011' });
    expect(lines[5]).toMatchObject({ no: 6, name: 'Тримач для пустушки' });
    expect(totals.netKop).toBe(119000);
  });

  it('skips zero-qty parts; empty parts = leave as Mix', () => {
    const r1 = buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [{ variantId: 'v21', qty: 24 }, { variantId: 'v22', qty: 0 }] }], nibVariants);
    expect(r1.lines).toHaveLength(3);
    expect(r1.lines[1]!.name).toBe('Ніблер (рожевий)');
    const r2 = buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [] }], nibVariants);
    expect(r2.lines[1]!.name).toBe('Ніблер (Мікс) (0001)');
  });

  it('split sum mismatch', () => {
    const splits = [{ lineIndex: 1, parts: [{ variantId: 'v21', qty: 6 }, { variantId: 'v22', qty: 6 }, { variantId: 'v23', qty: 6 }, { variantId: 'v24', qty: 5 }] }];
    expect(caught(() => buildDocumentLines(mixOrder(), splits, nibVariants))).toMatchObject({ code: 'SPLIT_SUM_MISMATCH' });
  });

  it('unknown variant (foreign product or the Mix itself)', () => {
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [{ variantId: 'v99', qty: 24 }] }], nibVariants))).toMatchObject({ code: 'UNKNOWN_VARIANT' });
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [{ variantId: 'id_20', qty: 24 }] }], nibVariants))).toMatchObject({ code: 'UNKNOWN_VARIANT' });
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [{ variantId: 'v21', qty: 24 }] }], {}))).toMatchObject({ code: 'UNKNOWN_VARIANT' });
  });

  it('a variant whose name is a Mix is never a colour', () => {
    const v = { '0001': [...nibVariants['0001']!, { id: 'id_77', sku: '0001', name: 'Ніблер (мікс) новий' }] };
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [{ variantId: 'id_77', qty: 24 }] }], v))).toMatchObject({ code: 'UNKNOWN_VARIANT' });
  });

  it('invalid split target (not a mix line / out of range / duplicate)', () => {
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 0, parts: [{ variantId: 'v21', qty: 2 }] }], nibVariants))).toMatchObject({ code: 'INVALID_SPLIT' });
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 7, parts: [{ variantId: 'v21', qty: 2 }] }], nibVariants))).toMatchObject({ code: 'INVALID_SPLIT' });
    const p = [{ variantId: 'v21', qty: 24 }];
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: p }, { lineIndex: 1, parts: p }], nibVariants))).toMatchObject({ code: 'INVALID_SPLIT' });
    expect(caught(() => buildDocumentLines(mixOrder(), [{ lineIndex: 1, parts: [{ variantId: 'v21', qty: -1 }, { variantId: 'v22', qty: 25 }] }], nibVariants))).toMatchObject({ code: 'INVALID_SPLIT' });
  });

  it('float prices are rounded to kopecks', () => {
    const o = order([line({ price: 57.599999999999994, amount: 3 })], { paymentAmount: 172.8 });
    const { lines, totals } = buildDocumentLines(o, [], {});
    expect(lines[0]!.priceKop).toBe(5760);
    expect(totals.netKop).toBe(17280);
  });

  it('many float lines still sum exactly', () => {
    const ls = Array.from({ length: 69 }, (_, i) => line({ productId: i, price: 0.1 + i * 1.7, amount: 3 }));
    const paymentAmount = ls.reduce((s, l) => s + l.amount * l.price, 0); // float-ish sum, as SalesDrive sends
    const { totals } = buildDocumentLines(order(ls, { paymentAmount }), [], {});
    expect(totals.netKop).toBe(Math.round(paymentAmount * 100));
  });

  it('discount: order + per-unit line discount', () => {
    const o = order([line({ amount: 2, price: 100, discount: 10 })], { discountAmount: 30, paymentAmount: 150 });
    const { lines, totals } = buildDocumentLines(o, [], {});
    expect(lines[0]).toMatchObject({ priceKop: 10000, sumKop: 20000 });
    expect(totals).toEqual({ grossKop: 20000, discountKop: 5000, netKop: 15000 });
  });

  it('total mismatch', () => {
    const o = order([line({ amount: 2, price: 100 })], { paymentAmount: 199.99 });
    expect(caught(() => buildDocumentLines(o, [], {}))).toMatchObject({ code: 'TOTAL_MISMATCH' });
    expect(() => buildDocumentLines(o, [], {})).toThrow('Сума документа не збігається із замовленням');
  });

  it('fixture 55225', () => {
    const o: SdOrder = JSON.parse(readFileSync(new URL('../fixtures/order-55225.json', import.meta.url), 'utf8'));
    const { lines, totals } = buildDocumentLines(o, [], {});
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ sku: '0935', barcode: '4826077009359', priceKop: 7600 });
    expect(totals).toEqual({ grossKop: 16700, discountKop: 0, netKop: 16700 });
  });
});
