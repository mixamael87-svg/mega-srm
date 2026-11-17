import type { DocLine, DocTotals } from '../domain/types';
import { COLUMNS, renderDocument, type DocHeader } from './common';

export function renderNakladna(h: DocHeader, lines: DocLine[], t: DocTotals): Promise<Buffer> {
  return renderDocument(
    {
      title: 'Видаткова накладна',
      sheetName: 'Накладна',
      columns: [COLUMNS.no, COLUMNS.sku, COLUMNS.name(41), COLUMNS.barcode, COLUMNS.qty, COLUMNS.price, COLUMNS.sum],
    },
    h, lines, t,
  );
}
