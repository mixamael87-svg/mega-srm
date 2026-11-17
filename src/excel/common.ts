import ExcelJS from 'exceljs';
import type { DocLine, DocTotals } from '../domain/types';
import { amountInWordsUah } from '../domain/amountInWords';
import { formatDocDate, formatMoney, formatQty } from '../domain/format';

export type DocHeader = {
  number: number;
  date: Date;
  /** Multiline: name + requisites */
  supplier: string;
  recipient: string;
  payer: string;
};

type Column = { title: string; width: number; value: (l: DocLine) => string; align: 'left' | 'center' | 'right' };

export const COLUMNS = {
  no: { title: '№', width: 4, value: l => String(l.no), align: 'center' },
  sku: { title: 'Артикул', width: 12, value: l => l.sku, align: 'center' },
  name: (width: number): Column => ({ title: 'Повна назва товару', width, value: l => l.name, align: 'left' }),
  barcode: { title: 'ШтрихКод', width: 15, value: l => l.barcode, align: 'center' },
  qty: { title: 'К-ть', width: 8, value: l => formatQty(l.qty), align: 'right' },
  price: { title: 'Ціна', width: 10, value: l => formatMoney(l.priceKop), align: 'right' },
  sum: { title: 'Сума', width: 11, value: l => formatMoney(l.sumKop), align: 'right' },
} satisfies Record<string, Column | ((w: number) => Column)>;

export type DocLayout = {
  title: string;
  columns: Column[];
  /** Rahunok: "ПДВ: 0,00 грн." after the amount in words */
  vatLineAfterWords: boolean;
  sheetName: string;
};

const FONT = 'Arial';
const thin: Partial<ExcelJS.Border> = { style: 'thin' };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

export async function renderDocument(layout: DocLayout, h: DocHeader, lines: DocLine[], t: DocTotals): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MEGA SRM';
  const ws = wb.addWorksheet(layout.sheetName, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  const cols = layout.columns;
  const n = cols.length;
  ws.columns = cols.map(c => ({ width: c.width }));
  ws.properties.defaultRowHeight = 12;

  let r = 0;
  const row = () => ws.getRow(++r);
  const put = (rowNo: number, col: number, value: string, opts: { bold?: boolean; size?: number; italic?: boolean; align?: ExcelJS.Alignment['horizontal']; wrap?: boolean; toCol?: number; border?: boolean } = {}) => {
    const cell = ws.getCell(rowNo, col);
    cell.value = value;
    cell.font = { name: FONT, size: opts.size ?? 9, bold: !!opts.bold, italic: !!opts.italic };
    cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'top', wrapText: opts.wrap ?? false };
    if (opts.toCol && opts.toCol > col) ws.mergeCells(rowNo, col, rowNo, opts.toCol);
    if (opts.border) for (let c = col; c <= (opts.toCol ?? col); c++) ws.getCell(rowNo, c).border = box;
    return cell;
  };
  const lineCount = (s: string) => Math.max(1, s.split('\n').length);

  // Шапка
  for (const [label, value] of [['Постачальник:', h.supplier], ['Одержувач:', h.recipient], ['Платник:', h.payer], ['Умова продажу:', '']] as const) {
    const rw = row();
    put(r, 1, label, { bold: true, toCol: 2 });
    put(r, 3, value, { wrap: true, toCol: n });
    rw.height = 12 * lineCount(value) + 2;
  }
  row();

  // Заголовок
  row().height = 16;
  put(r, 1, `${layout.title} № ${h.number}`, { bold: true, size: 12, align: 'center', toCol: n });
  row();
  put(r, 1, `від ${formatDocDate(h.date)}`, { size: 10, align: 'center', toCol: n });
  row();

  // Таблица
  row();
  cols.forEach((c, i) => put(r, i + 1, c.title, { bold: true, align: 'center', border: true, wrap: true }));
  for (const l of lines) {
    const rw = row();
    cols.forEach((c, i) => put(r, i + 1, c.value(l), { align: c.align, border: true, wrap: c.align === 'left' }));
    const nameCol = cols.findIndex(c => c.title === 'Повна назва товару');
    const width = cols[nameCol]?.width ?? 40;
    rw.height = 12 * Math.max(1, Math.ceil(l.name.length / (width * 1.3)));
  }

  // Итоги
  const total = (label: string, kop: number, bold = false) => {
    row();
    put(r, 3, label, { bold, align: 'right', toCol: n - 1 });
    put(r, n, formatMoney(kop), { bold, align: 'right' });
  };
  if (t.discountKop !== 0) {
    total('Сума без знижки:', t.grossKop);
    total('Знижка:', t.discountKop);
    total('Сума зі знижкою:', t.netKop);
  }
  total('Разом без ПДВ:', t.netKop, true);
  total('ПДВ:', 0);
  total('Всього з ПДВ:', t.netKop, true);
  row();

  row().height = 24;
  put(r, 1, 'Всього на суму:', { bold: true, toCol: 2 });
  put(r, 3, amountInWordsUah(t.netKop), { bold: true, wrap: true, toCol: n });
  if (layout.vatLineAfterWords) {
    row();
    put(r, 1, 'ПДВ: 0,00 грн.', { toCol: n });
  }
  row();

  // Подписи
  const line = (text: string, opts: { bold?: boolean; italic?: boolean; size?: number } = {}) => { row(); put(r, 1, text, { ...opts, toCol: n }); };
  row();
  line('Від постачальника*:   ______________________________', { bold: true });
  row();
  line('Отримав(ла):   ______________________________', { bold: true });
  line('                          за дов. № ____________ від ____________');
  row();
  line('* Відповідальний за здійснення господарської операції і правильність її оформлення', { italic: true, size: 8 });
  line('Місце складання:   ______________________________', { bold: true });

  ws.pageSetup.printArea = `A1:${ws.getColumn(n).letter}${r}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
