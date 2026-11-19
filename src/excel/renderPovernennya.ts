import type { DocLine, DocTotals } from '../domain/types';
import { COLUMNS, renderDocument, type DocHeader } from './common';

/** «Накладна на повернення» — same grid as the nakladna (with barcode). */
export function renderPovernennya(h: DocHeader, lines: DocLine[], t: DocTotals): Promise<Buffer> {
  return renderDocument(
    {
      title: 'Накладна на повернення',
      sheetName: 'Повернення',
      columns: [COLUMNS.no, COLUMNS.sku, COLUMNS.name(41), COLUMNS.barcode, COLUMNS.qty, COLUMNS.price, COLUMNS.sum],
    },
    h, lines, t,
  );
}
