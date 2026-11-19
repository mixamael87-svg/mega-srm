import { describe, it, expect } from 'vitest';
import { skuFromBarcode, matchLines } from '../../src/reports/match';
import { aggregate } from '../../src/reports/aggregate';
import type { RawLine } from '../../src/reports/types';

const L = (p: Partial<RawLine>): RawLine => ({ store: 'A', code: '1', name: 'X', barcode: '', priceKop: 1000, qty: 1, ...p });

describe('skuFromBarcode', () => {
  it('our EAN-13 with a valid check digit → SKU', () => {
    expect(skuFromBarcode('4826077009090')).toBe('0909');
    expect(skuFromBarcode(' 4826077009267 ')).toBe('0926');
  });
  it('foreign, broken check digit, empty → null', () => {
    for (const b of ['4820288950011', '4826077009091', '', '48260770090', 'abc']) expect(skuFromBarcode(b)).toBeNull();
  });
});

describe('matchLines', () => {
  it('barcode first, then remembered code; unknown → unmatched; learns codes', () => {
    const lines = [L({ code: '88514', barcode: '4826077009090' }), L({ code: '89625' }), L({ code: '90001', barcode: '4820288950011' })];
    const r = matchLines(lines, new Map([['89625', '0904'], ['88514', '9999']]));
    expect(r.matched.map(m => [m.code, m.sku])).toEqual([['88514', '0909'], ['89625', '0904']]);
    expect(r.unmatched.map(u => u.code)).toEqual(['90001']);
    expect([...r.learned]).toEqual([['88514', '0909']]);
    expect(r.conflicts).toEqual([]);
  });
  it('a code with two different barcodes is not learned and reported as a conflict', () => {
    const r = matchLines([L({ code: '7', barcode: '4826077009090' }), L({ code: '7', barcode: '4826077009045' })], new Map());
    expect(r.matched.map(m => m.sku)).toEqual(['0909', '0904']);
    expect([...r.learned]).toEqual([]);
    expect(r.conflicts).toEqual(['7']);
  });
});

describe('aggregate', () => {
  const m = (p: Partial<RawLine> & { sku: string }) => ({ ...L(p), sku: p.sku });
  const rows = [
    m({ store: 'A', sku: '0909', qty: 2, opening: 2 }), m({ store: 'A', sku: '0909', qty: 1, opening: 1 }),
    m({ store: 'A', sku: '0904', qty: 3 }), m({ store: 'B', sku: '0909', qty: 3 }), m({ store: 'B', sku: '0909', priceKop: 1200, qty: 1 }),
  ];
  it('one store: repeats of (sku, price) are summed, order of first appearance', () => {
    expect(aggregate(rows, 'A')).toEqual([{ sku: '0909', priceKop: 1000, qty: 3, opening: 3, incoming: 0, soldRetail: 0, soldOther: 0 }, { sku: '0904', priceKop: 1000, qty: 3, opening: 0, incoming: 0, soldRetail: 0, soldOther: 0 }]);
  });
  it('ALL sums stores; a different price stays a separate row', () => {
    expect(aggregate(rows, 'ALL').map(r => [r.sku, r.priceKop, r.qty])).toEqual([['0909', 1000, 6], ['0904', 1000, 3], ['0909', 1200, 1]]);
  });
});
