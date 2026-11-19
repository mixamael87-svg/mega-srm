import { describe, it, expect } from 'vitest';
import { createNameIndex } from '../../src/reports/suggest';
import { aggregateByCode } from '../../src/reports/aggregate';
import type { RawLine } from '../../src/reports/types';

const catalog = [
  { id: '1', sku: '0904', name: 'Аквакилимок "Кит"' },
  { id: '2', sku: '0905', name: 'Аквакилимок "Дельфіни"' },
  { id: '3', sku: '0001', name: 'Ніблер (Мікс) (0001)' },
  { id: '4', sku: '0001', name: 'Ніблер (рожевий)' },
  { id: '5', sku: '0909', name: 'Набір іграшок для купання "Уточки" (5 шт)' },
];

describe('name suggestions', () => {
  const idx = createNameIndex(catalog);
  it('finds the closest catalog product, ignoring case, quotes and punctuation', () => {
    expect(idx.suggest('  Аквакилимок «КИТ» ')).toMatchObject({ sku: '0904', name: 'Аквакилимок "Кит"' });
    expect(idx.suggest('Набір іграшок для купання Уточки 5шт')).toMatchObject({ sku: '0909' });
    expect(idx.suggest('Аквакилимок "Дельфіни"')!.score).toBeGreaterThan(0.9);
  });
  it('below 0.35 → no suggestion', () => {
    expect(idx.suggest('Пелюшка фланелева 90*100')).toBeNull();
    expect(idx.suggest('')).toBeNull();
  });
  it('several products of one SKU → the «Мікс» name is shown', () => {
    expect(idx.suggest('Ніблер')).toMatchObject({ sku: '0001', name: 'Ніблер (Мікс) (0001)' });
  });
});

describe('aggregateByCode', () => {
  const L = (p: Partial<RawLine>): RawLine => ({ store: 'A', code: '1', name: 'X', barcode: '', priceKop: 1000, qty: 1, ...p });
  it('sums repeats of (code, price) per store or ALL', () => {
    const lines = [L({ code: '7', qty: 2 }), L({ code: '7', qty: 1 }), L({ code: '8', qty: 3 }), L({ store: 'B', code: '7', qty: 4 }), L({ code: '7', priceKop: 1200, qty: 1 })];
    expect(aggregateByCode(lines, 'A').map(r => [r.code, r.priceKop, r.qty])).toEqual([['7', 1000, 3], ['8', 1000, 3], ['7', 1200, 1]]);
    expect(aggregateByCode(lines, 'ALL').map(r => [r.code, r.priceKop, r.qty])).toEqual([['7', 1000, 7], ['8', 1000, 3], ['7', 1200, 1]]);
    expect(aggregateByCode(lines, 'B')[0]).toMatchObject({ code: '7', name: 'X', qty: 4, opening: 0 });
  });
});
