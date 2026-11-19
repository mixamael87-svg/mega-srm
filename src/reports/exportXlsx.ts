import ExcelJS from 'exceljs';
import { ean13FromSku } from '../domain/barcode';
import { formatMoney } from '../domain/format';
import type { ReportKind } from './types';
import type { AggRow } from './aggregate';

export type ExportMeta = { client: string; title: string; kind: ReportKind; dateFrom: string | null; dateTo: string; store: string };
export type ExportRow = AggRow & { name: string; newPriceKop?: number | null };

const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));

/** Client report in our format: our SKU, our name, barcode, quantities, old/new price and sums. */
export async function exportReportXlsx(meta: ExportMeta, rows: ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Звіт');
  const turnover = meta.kind === 'turnover';
  const head = ['№', 'Артикул', 'Назва', 'Штрихкод',
    ...(turnover ? ['Залишок на початок', 'Прихід', 'Продано (роздріб)', 'Продано (інше)', 'Залишок на кінець'] : ['К-сть']),
    'Стара ціна', 'Нова ціна', 'Сума стара', 'Сума нова'];
  ws.addRow([meta.client]).font = { bold: true, size: 12 };
  ws.addRow([`${meta.title}${meta.dateFrom ? ` · ${meta.dateFrom} – ${meta.dateTo}` : ` · ${meta.dateTo}`} · ${meta.store}`]);
  ws.addRow([]);
  const h = ws.addRow(head);
  h.font = { bold: true };
  let oldSum = 0, newSum = 0;
  rows.forEach((r, i) => {
    const o = Math.round(r.qty * r.priceKop);
    const n = r.newPriceKop ? Math.round(r.qty * r.newPriceKop) : null;
    oldSum += o; if (n != null) newSum += n;
    ws.addRow([String(i + 1), r.sku, r.name, ean13FromSku(r.sku),
      ...(turnover ? [r.opening, r.incoming, r.soldRetail, r.soldOther, r.qty].map(qtyText) : [qtyText(r.qty)]),
      formatMoney(r.priceKop), r.newPriceKop ? formatMoney(r.newPriceKop) : '', formatMoney(o), n != null ? formatMoney(n) : '']);
  });
  const total = ws.addRow([...Array(head.length - 3).fill(''), 'Разом', formatMoney(oldSum), newSum ? formatMoney(newSum) : '']);
  total.font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === 2 ? 50 : i === 3 ? 15 : 12; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
