import { describe, it, expect } from 'vitest';
import { planLabels, labelRows, pagesForItems, type LabelRecord } from '../../src/domain/labels';
import type { DocLine } from '../../src/domain/types';

let no = 0;
const line = (sku: string, qty: number, name = `Товар ${sku}`): DocLine => ({ no: ++no, sku, name, barcode: '', qty, priceKop: 100, sumKop: 100 * qty });
const content = (text: string) => ({ text, align: 'center' as const, showMark: false, barcode: '' });
const label = (id: number, sku: string | null, extra: LabelRecord['extra'] = null, noPrint = false): LabelRecord =>
  ({ id, sku, noPrint, extra, ...content(`L${sku ?? id}`) });

describe('planLabels', () => {
  it('groups colours of one sku and keeps first-appearance order', () => {
    const p = planLabels([line('0205', 3), line('0311', 2), line('0205', 4)], [label(1, '0311'), label(2, '0205')]);
    expect(p.pages.map(x => x.text)).toEqual([...Array(7).fill('L0205'), 'L0311', 'L0311']);
    expect(p.printedCount).toBe(9);
    expect(p.missing).toEqual([]);
  });

  it('missing and odd skus are reported, not printed', () => {
    const p = planLabels([line('0412', 3, 'Пустушка'), line('id_2022', 1, 'Набір'), line('', 2, 'Без артикулу')], []);
    expect(p.pages).toEqual([]);
    expect(p.missing).toEqual([
      { sku: '0412', name: 'Пустушка', qty: 3 },
      { sku: 'id_2022', name: 'Набір', qty: 1 },
      { sku: '', name: 'Без артикулу', qty: 2 },
    ]);
  });

  it('noPrint label is never printed', () => {
    const p = planLabels([line('2004', 5, 'Кулька')], [label(1, '2004', null, true)]);
    expect(p.pages).toEqual([]);
    expect(p.noPrint).toEqual([{ sku: '2004', name: 'Кулька', qty: 5 }]);
    expect(p.printedCount).toBe(0);
  });

  it('extra label follows every unit', () => {
    const p = planLabels([line('1205', 2)], [label(1, '1205', { ...content('Ч2'), noPrint: false })]);
    expect(p.pages.map(x => x.text)).toEqual(['L1205', 'Ч2', 'L1205', 'Ч2']);
    expect(p.printedCount).toBe(4);
  });

  it('extra with noPrint is skipped silently', () => {
    const p = planLabels([line('1205', 2)], [label(1, '1205', { ...content('Ч2'), noPrint: true })]);
    expect(p.pages.map(x => x.text)).toEqual(['L1205', 'L1205']);
  });

  it('fractional qty rounds up, zero qty is ignored', () => {
    expect(planLabels([line('0205', 1.5)], [label(1, '0205')]).pages).toHaveLength(2);
    const z = planLabels([line('0205', 0), line('0412', 0)], [label(1, '0205')]);
    expect(z).toEqual({ pages: [], missing: [], noPrint: [], printedCount: 0 });
  });
});

describe('labelRows', () => {
  const rec = (sku: string, o: Partial<LabelRecord> = {}): LabelRecord => ({ ...label(1, sku), ...o });
  it('one row per sku, summed, in first-appearance order, with status and extra title', () => {
    const rows = labelRows(
      [line('0205', 3, 'Пляшка'), line('1205', 2, 'Пищалка'), line('0412', 1, 'Пустушка'), line('0205', 4), line('2004', 5, 'Кулька'), line('0300', 0)],
      [rec('0205'), rec('1205', { extra: { ...content('Ч2'), noPrint: false }, extraTitle: 'Частина 2' }), rec('2004', { noPrint: true })],
    );
    expect(rows).toEqual([
      { sku: '0205', name: 'Пляшка', qty: 7, status: 'ok', extra: null },
      { sku: '1205', name: 'Пищалка', qty: 2, status: 'ok', extra: 'Частина 2' },
      { sku: '0412', name: 'Пустушка', qty: 1, status: 'missing', extra: null },
      { sku: '2004', name: 'Кулька', qty: 5, status: 'noPrint', extra: null },
    ]);
  });
});

describe('pagesForItems', () => {
  it('prints edited quantities, skips unknown, noPrint and zero', () => {
    const p = pagesForItems([{ sku: '0205', qty: 2 }, { sku: '0412', qty: 3 }, { sku: '2004', qty: 1 }, { sku: '0311', qty: 0 }, { sku: '0205', qty: 1 }],
      [label(1, '0205'), label(2, '2004', null, true), label(3, '0311')]);
    expect(p.map(x => x.text)).toEqual(['L0205', 'L0205', 'L0205']);
  });
});
