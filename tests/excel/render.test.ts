import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { renderNakladna } from '../../src/excel/renderNakladna';
import { renderRahunok } from '../../src/excel/renderRahunok';
import type { DocHeader } from '../../src/excel/common';
import type { DocLine, DocTotals } from '../../src/domain/types';

const header = (number: number, date: Date): DocHeader => ({
  number, date,
  supplier: 'ФОП Кузнецов Михайло Володимирович\nтел. 0670000000\nЮр. адреса: м. Київ, вул. Тестова, 1\nIBAN UA000000000000000000000000000 в АТ КБ "ПРИВАТБАНК"\nІПН 1234567890',
  recipient: 'ФОП Палій Анна\nЮр. адреса: м. Полтава\nІПН 0987654321',
  payer: 'той самий',
});
const lines: DocLine[] = [
  { no: 1, sku: '0001', name: 'Ніблер (рожевий)', barcode: '4826077000011', qty: 6, priceKop: 4500, sumKop: 27000 },
  { no: 2, sku: 'id_1233', name: 'Пелюшка', barcode: '', qty: 1, priceKop: 3962855 - 27000, sumKop: 3962855 - 27000 },
];
const totals: DocTotals = { grossKop: 3962855, discountKop: 0, netKop: 3962855 };

type Sheet = { rows: string[][]; ws: ExcelJS.Worksheet };
async function load(buf: Buffer): Promise<Sheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0]!;
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => { cells[col - 1] = c.isMerged && c.master !== c ? '' : String(c.text ?? ''); });
    rows[r - 1] = cells;
  });
  return { rows: rows.map(r => Array.from(r ?? [], x => x ?? '')), ws };
}
const all = (s: Sheet) => s.rows.flat();
const has = (s: Sheet, text: string) => all(s).some(c => c.includes(text));
/** Value of the first non-empty cell to the right of the cell whose text equals `label`. */
function right(s: Sheet, label: string): string | undefined {
  for (const r of s.rows) {
    const i = r.findIndex(c => c.trim() === label);
    if (i >= 0) return r.slice(i + 1).find(c => c.trim() !== '');
  }
  return undefined;
}
const rowOf = (s: Sheet, first: string) => s.rows.find(r => r.filter(c => c !== '')[0] === first)?.filter(c => c !== '');

describe('renderNakladna', () => {
  it('title, header, table, totals, signatures', async () => {
    const s = await load(await renderNakladna(header(54969, new Date(2026, 10, 12)), lines, totals));
    expect(has(s, 'Видаткова накладна № 54969')).toBe(true);
    expect(has(s, 'від 12 листопада 2026 р.')).toBe(true);
    expect(rowOf(s, '№')).toEqual(['№', 'Артикул', 'Повна назва товару', 'ШтрихКод', 'К-ть', 'Ціна', 'Сума']);
    expect(rowOf(s, '1')).toEqual(['1', '0001', 'Ніблер (рожевий)', '4826077000011', '6,00', '45,00', '270,00']);
    expect(rowOf(s, '2')).toEqual(['2', 'id_1233', 'Пелюшка', '1,00', '39358,55', '39358,55']);
    expect(right(s, 'Разом без ПДВ:')).toBe('39628,55');
    expect(right(s, 'ПДВ:')).toBe('0,00');
    expect(right(s, 'Всього з ПДВ:')).toBe('39628,55');
    expect(right(s, 'Всього на суму:')).toBe("Тридцять дев'ять тисяч шістсот двадцять вісім гривень 55 копійок");
    for (const t of ['Від постачальника*:', 'Отримав(ла):', 'Місце складання:', 'за дов. №', '* Відповідальний за здійснення господарської операції і правильність її оформлення']) expect(has(s, t)).toBe(true);
    expect(has(s, 'Сума без знижки')).toBe(false);
  });
  it('header block: Постачальник / Одержувач / Платник / Умова продажу', async () => {
    const s = await load(await renderNakladna(header(1, new Date(2026, 0, 1)), lines, totals));
    expect(right(s, 'Постачальник:')).toContain('ФОП Кузнецов Михайло Володимирович\nтел. 0670000000');
    expect(right(s, 'Одержувач:')).toContain('ФОП Палій Анна');
    expect(right(s, 'Платник:')).toBe('той самий');
    expect(rowOf(s, 'Умова продажу:')).toBeTruthy();
  });
  it('page setup: A4 portrait, fit to width', async () => {
    const { ws } = await load(await renderNakladna(header(1, new Date()), lines, totals));
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.orientation).toBe('portrait');
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);
  });
  it('discount rows; amount in words from net', async () => {
    const t: DocTotals = { grossKop: 20000, discountKop: 5000, netKop: 15000 };
    const l: DocLine[] = [{ no: 1, sku: '0001', name: 'X', barcode: '', qty: 2, priceKop: 10000, sumKop: 20000 }];
    const s = await load(await renderNakladna(header(5, new Date()), l, t));
    expect(right(s, 'Сума без знижки:')).toBe('200,00');
    expect(right(s, 'Знижка:')).toBe('50,00');
    expect(right(s, 'Сума зі знижкою:')).toBe('150,00');
    expect(right(s, 'Разом без ПДВ:')).toBe('150,00');
    expect(right(s, 'Всього з ПДВ:')).toBe('150,00');
    expect(right(s, 'Всього на суму:')).toBe("Сто п'ятдесят гривень 00 копійок");
  });
});

describe('renderRahunok', () => {
  it('title, no barcode column, VAT line', async () => {
    const s = await load(await renderRahunok(header(14, new Date(2026, 10, 4)), lines, totals));
    expect(has(s, 'Рахунок-фактура № 14')).toBe(true);
    expect(has(s, 'від 04 листопада 2026 р.')).toBe(true);
    expect(has(s, 'ШтрихКод')).toBe(false);
    expect(has(s, '4826077000011')).toBe(false);
    expect(rowOf(s, '№')).toEqual(['№', 'Артикул', 'Повна назва товару', 'К-ть', 'Ціна', 'Сума']);
    expect(rowOf(s, '1')).toEqual(['1', '0001', 'Ніблер (рожевий)', '6,00', '45,00', '270,00']);
    expect(has(s, 'ПДВ: 0,00 грн.')).toBe(true);
    expect(right(s, 'Всього з ПДВ:')).toBe('39628,55');
    expect(has(s, 'Від постачальника*:')).toBe(true);
  });
});
