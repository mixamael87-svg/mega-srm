import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { readSheetRows } from '../../src/reports/xls';
import { isBagel, parseBagel } from '../../src/reports/bagel';

const fx = (n: string) => readSheetRows(readFileSync(new URL(`../fixtures/reports/${n}`, import.meta.url)));
const caught = (fn: () => unknown) => { try { fn(); } catch (e) { return e as { code: string; message: string }; } throw new Error('expected error'); };

describe('Bagel reports', () => {
  it('stock: header, stores, lines; repeated rows kept; serial dates', () => {
    const rows = fx('bagel-stock.xls');
    expect(isBagel(rows)).toBe(true);
    const r = parseBagel(rows);
    expect(r).toMatchObject({ format: 'bagel', kind: 'stock', client: '"Demo Kids" магазин дитячих товарів', title: 'Залишок товару по постачальникам', dateFrom: '01.11.2026', dateTo: '02.11.2026' });
    expect(r.stores).toEqual(['Магазин DEMO KIDS ТЦ "Центр"', 'Магазин DEMO KIDS ТЦ "Парк"']);
    expect(r.lines).toHaveLength(7);
    expect(r.lines[0]).toEqual({ store: 'Магазин DEMO KIDS ТЦ "Центр"', code: '88514', name: 'Набір іграшок для купання "Уточки" (5 шт)', barcode: '', priceKop: 8740, qty: 2 });
    expect(r.lines[1]).toMatchObject({ code: '88514', qty: 1 });
    expect(r.lines.reduce((s, l) => s + l.qty, 0)).toBe(17);
  });

  it('turnover: opening/incoming/sold/closing, barcode, period', () => {
    const r = parseBagel(fx('bagel-turnover.xls'));
    expect(r).toMatchObject({ kind: 'turnover', title: 'Оборот по постачальникам', dateFrom: '01.10.2026', dateTo: '31.10.2026' });
    expect(r.lines).toHaveLength(7);
    expect(r.lines.find(l => l.code === '89631')).toEqual({ store: 'Магазин DEMO KIDS ТЦ "Центр"', code: '89631', name: 'Набір тактильних м`ячиків (6 шт)', barcode: '4826077009267', priceKop: 16790, qty: 4, opening: 3, incoming: 2, soldRetail: 1, soldOther: 0 });
    expect(r.lines.reduce((s, l) => s + (l.opening ?? 0), 0)).toBe(18);
  });

  it('a lost row is detected against «Разом» (turnover: closing qty, stock: purchase amount)', () => {
    const t = fx('bagel-turnover.xls');
    const i = t.findIndex(r => r[0] === '89625');
    t.splice(i, 1);
    expect(caught(() => parseBagel(t))).toMatchObject({ code: 'TOTAL_MISMATCH', message: expect.stringContaining('Кількість не збігається з підсумком звіту') });
    const s = fx('bagel-stock.xls');
    s.splice(s.findIndex(r => r[0] === '89631'), 1);
    expect(caught(() => parseBagel(s))).toMatchObject({ code: 'TOTAL_MISMATCH', message: expect.stringContaining('Сума не збігається з підсумком звіту') });
  });

  it('unknown layout → UNKNOWN_FORMAT', () => {
    const rows = [['Артикул', 'Товар', 'Кількість'], ['0905', 'Кит', '2']];
    expect(isBagel(rows)).toBe(false);
    expect(caught(() => parseBagel(rows))).toMatchObject({ code: 'UNKNOWN_FORMAT' });
  });

  // Real client files are kept outside the repo; checked when present.
  const real = (p: string) => (existsSync(p) ? it : it.skip);
  real('/tmp/rep/stock.xls')('real stock sample: 472 lines, 2 stores, totals match', () => {
    const r = parseBagel(readSheetRows(readFileSync('/tmp/rep/stock.xls')));
    expect([r.lines.length, r.stores.length, r.dateTo]).toEqual([472, 2, '02.11.2026']);
  });
  real('/tmp/rep/sales.xls')('real turnover sample: 419 lines, closing 1204', () => {
    const r = parseBagel(readSheetRows(readFileSync('/tmp/rep/sales.xls')));
    expect([r.lines.length, r.lines.reduce((s, l) => s + l.qty, 0)]).toEqual([419, 1204]);
  });
});
