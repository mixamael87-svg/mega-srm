import * as XLSX from 'xlsx';

/** First sheet of an .xls/.xlsx file as rows of displayed cell text ('' for empty). */
export function readSheetRows(buf: Buffer | Uint8Array): string[][] {
  const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: '', blankrows: true });
  return rows.map(r => r.map(c => (c == null ? '' : String(c))));
}
