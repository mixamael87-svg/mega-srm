/**
 * Synthetic Bagel reports with the same structure as the real ones (real client files are NOT committed).
 *   npx tsx scripts/make-report-fixtures.ts
 */
import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 24;
const row = (cells: Record<number, string | number>) => Array.from({ length: W }, (_, i) => cells[i] ?? '');
const head = (title: string, d1: string | number, d2: string | number) => [
  row({ 2: '"Demo Kids" магазин дитячих товарів' }), row({}), row({ 4: title }), row({ 9: d1, 12: d2 }), row({ 0: 'Mega Zayka' }),
];
const money = (k: number) => (k / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type P = { code: string; name: string; price: number; barcode: string };
const P1: P = { code: '88514', name: '  Набір іграшок для купання "Уточки" (5 шт)', price: 8740, barcode: '4826077009090' };
const P2: P = { code: '89625', name: '  Аквакилимок "Кит"', price: 15410, barcode: '4826077009045' };
const P3: P = { code: '90001', name: '  Чужий товар', price: 5000, barcode: '4820288950011' };
const P4: P = { code: '89631', name: '  Набір тактильних м`ячиків (6 шт)', price: 16790, barcode: '4826077009267' };

// store → category → lines [product, opening, incoming, soldRetail, closing]
const stores: [string, [string, [P, number, number, number, number][]][]][] = [
  ['Магазин DEMO KIDS ТЦ "Центр"', [
    ['Іграшки для води та пляжу, пісочниці', [[P1, 2, 0, 0, 2], [P1, 1, 0, 0, 1], [P2, 4, 0, 1, 3]]],
    ['Розвиваючі іграшки', [[P4, 3, 2, 1, 4], [P3, 1, 0, 0, 1]]],
  ]],
  ['Магазин DEMO KIDS ТЦ "Парк"', [
    ['Іграшки для води та пляжу, пісочниці', [[P2, 2, 1, 0, 3], [P1, 5, 0, 2, 3]]],
  ]],
];

function turnover() {
  const rows = head('Оборот по постачальникам', '01.10.2026', '31.10.2026');
  let T = [0, 0, 0, 0];
  for (const [store, cats] of stores) {
    rows.push(row({ 0: store }), row({ 0: 'Всі товари' }));
    let S = [0, 0, 0, 0];
    for (const [cat, lines] of cats) {
      rows.push(row({ 0: cat }));
      rows.push(row({ 0: 'Код', 1: 'Назва', 6: 'Ціна закупки', 7: 'Тип постачання', 8: 'Штрих код', 10: '01.10.2026', 13: 'Документи приходу', 14: 'Документи роздрібного продажу', 16: 'Документи продажу', 18: '10.31.2026', 19: 'Дата ост. приходу' }));
      for (const [p, o, inc, sold, c] of lines) {
        rows.push(row({ 0: p.code, 1: p.name, 6: (p.price / 100).toFixed(2), 7: '0', 8: p.barcode, 10: String(o), 13: inc ? inc.toFixed(2) : '', 14: sold ? sold.toFixed(2) : '', 18: String(c), 19: '14.09.2026' }));
        S = [S[0]! + o, S[1]! + inc, S[2]! + sold, S[3]! + c];
      }
      rows.push(row({ 0: 'Разом по підгрупі' }));
    }
    rows.push(row({ 0: 'Разом Підрозділ', 10: String(S[0]), 13: S[1]!.toFixed(2), 14: S[2]!.toFixed(2), 18: String(S[3]) }));
    T = T.map((v, i) => v + S[i]!);
  }
  rows.push(row({ 0: 'Разом Постачальник', 10: String(T[0]), 13: T[1]!.toFixed(2), 14: T[2]!.toFixed(2), 18: String(T[3]) }));
  rows.push(row({ 0: 'Разом', 10: String(T[0]), 13: T[1]!.toFixed(2), 14: T[2]!.toFixed(2), 18: String(T[3]) }));
  rows.push(row({}), row({ 0: '02.11.2026 15:47:26', 23: 19 }));
  return rows;
}

function stock() {
  const rows = head('Залишок товару по постачальникам', 46327, 46328); // Excel serial dates as in the real file
  let total = 0;
  for (const [store, cats] of stores) {
    rows.push(row({ 0: store }), row({ 0: 'Всі товари' }));
    let s = 0;
    for (const [cat, lines] of cats) {
      rows.push(row({ 0: cat }), row({ 0: 'Код', 1: 'Назва', 6: 'Ціна закупки', 7: 'Ціна продажу', 8: 'К-сть', 10: 'Сума закупки', 12: 'Сума продажу ' }));
      let c = 0;
      for (const [p, , , , q] of lines) {
        rows.push(row({ 0: p.code, 1: p.name, 6: (p.price / 100).toFixed(2), 8: String(q), 10: money(p.price * q) }));
        c += p.price * q;
      }
      rows.push(row({ 0: 'Разом по підгрупі', 10: money(c) }));
      s += c;
    }
    rows.push(row({ 0: 'Разом по групі', 10: money(s) }), row({ 0: 'Разом Підрозділ', 10: money(s) }));
    total += s;
  }
  rows.push(row({ 0: 'Разом Постачальник', 10: money(total) }), row({ 0: 'Разом', 10: money(total) }));
  rows.push(row({}), row({ 0: '02.11.2026 15:45:19', 7: 'www.bagel.com.ua', 17: 21 }));
  return rows;
}

const write = (rows: (string | number)[][], file: string) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Сторінка 0');
  writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }));
};
mkdirSync('tests/fixtures/reports', { recursive: true });
write(turnover(), 'tests/fixtures/reports/bagel-turnover.xls');
write(stock(), 'tests/fixtures/reports/bagel-stock.xls');
console.log('ok');
