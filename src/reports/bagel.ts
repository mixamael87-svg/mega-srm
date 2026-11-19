import { ReportParseError, type ParsedReport, type RawLine } from './types';

/** "62,969.40" / "154.10" / "2" / "" → number (Bagel: dot decimals, comma thousands). */
const num = (s: string | undefined): number => {
  const t = (s ?? '').replace(/[\s,]/g, '');
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const kop = (s: string | undefined) => Math.round(num(s) * 100);
const pad = (n: number) => String(n).padStart(2, '0');

/** Header date cell: "01.10.2026" or an Excel serial ("46328") → "dd.mm.yyyy". */
function dateText(s: string): string | null {
  const t = s.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) return t;
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86_400_000);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  }
  return null;
}

const isHeader = (r: string[]) => r[0]?.trim() === 'Код' && r[1]?.trim() === 'Назва';
const onlyFirst = (r: string[]) => !!r[0]?.trim() && r.slice(1).every(c => !c.trim());

export function isBagel(rows: string[][]): boolean {
  return rows.some(isHeader) && rows.some(r => r[0]?.trim() === 'Всі товари');
}

/** Parse a Bagel «Оборот по постачальникам» or «Залишок товару по постачальникам» report. */
export function parseBagel(rows: string[][]): ParsedReport {
  if (!isBagel(rows)) throw new ReportParseError('UNKNOWN_FORMAT', 'Формат файлу не розпізнано');
  const firstText = (r: string[] | undefined) => r?.find(c => c.trim())?.trim() ?? '';
  const headerAt = rows.findIndex(isHeader);
  const top = rows.slice(0, headerAt);
  const client = firstText(top[0]);
  const title = top.map(firstText).find(t => /Оборот|Залишок/i.test(t)) ?? '';
  const dates = top.flatMap(r => r.map(dateText).filter((d): d is string => !!d));
  const header0 = rows[headerAt]!.map(c => c.trim());
  const kind = /Оборот/i.test(title) ? 'turnover' : /Залишок/i.test(title) || header0.includes('К-сть') ? 'stock' : null;
  if (!kind || dates.length === 0) throw new ReportParseError('UNKNOWN_FORMAT', 'Формат файлу не розпізнано');

  const lines: RawLine[] = [];
  const stores: string[] = [];
  let store = '';
  let col: Record<string, number> = {};
  let stockAmountKop = 0;
  let total: string[] | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const c0 = r[0]?.trim() ?? '';
    if (onlyFirst(r) && rows[i + 1]?.[0]?.trim() === 'Всі товари') {
      store = c0;
      if (!stores.includes(store)) stores.push(store);
      continue;
    }
    if (isHeader(r)) {
      const h = r.map(c => c.trim());
      const at = (name: string) => h.indexOf(name);
      const dateCols = h.map((t, j) => (/^\d{2}\.\d{2}\.\d{4}$/.test(t) ? j : -1)).filter(j => j >= 0);
      col = {
        price: at('Ціна закупки'), barcode: at('Штрих код'), qty: at('К-сть'), amount: at('Сума закупки'),
        incoming: at('Документи приходу'), soldRetail: at('Документи роздрібного продажу'), soldOther: at('Документи продажу'),
        opening: dateCols[0] ?? -1, closing: dateCols[dateCols.length - 1] ?? -1,
      };
      continue;
    }
    if (c0 === 'Разом') { total = r; continue; }
    if (!/^\d+$/.test(c0) || !store) continue;

    const get = (k: string) => (col[k]! >= 0 ? r[col[k]!] : '');
    const line: RawLine = { store, code: c0, name: (r[1] ?? '').trim(), barcode: (get('barcode') ?? '').trim(), priceKop: kop(get('price')), qty: 0 };
    if (kind === 'stock') {
      line.qty = num(get('qty'));
      stockAmountKop += col.amount! >= 0 ? kop(get('amount')) : line.priceKop * line.qty;
    } else {
      Object.assign(line, { opening: num(get('opening')), incoming: num(get('incoming')), soldRetail: num(get('soldRetail')), soldOther: num(get('soldOther')), qty: num(get('closing')) });
    }
    lines.push(line);
  }

  if (!total) throw new ReportParseError('TOTAL_MISMATCH', 'У звіті немає підсумкового рядка «Разом»');
  if (kind === 'turnover') {
    const expected = num(total[col.closing!]);
    const got = lines.reduce((s, l) => s + l.qty, 0);
    if (Math.abs(expected - got) > 1e-6) throw new ReportParseError('TOTAL_MISMATCH', `Кількість не збігається з підсумком звіту (${got} ≠ ${expected})`);
  } else {
    const expected = kop(total[col.amount!]);
    if (expected !== stockAmountKop) throw new ReportParseError('TOTAL_MISMATCH', `Сума не збігається з підсумком звіту (${stockAmountKop / 100} ≠ ${expected / 100})`);
  }

  return { format: 'bagel', kind, client, title, dateFrom: dates.length > 1 ? dates[0]! : null, dateTo: dates[dates.length - 1]!, stores, lines };
}
