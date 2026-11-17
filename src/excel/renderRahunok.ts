import type { DocLine, DocTotals } from '../domain/types';
import { COLUMNS, renderDocument, type DocHeader } from './common';

export function renderRahunok(h: DocHeader, lines: DocLine[], t: DocTotals): Promise<Buffer> {
  return renderDocument(
    {
      title: 'Рахунок-фактура',
      sheetName: 'Рахунок',
      columns: [COLUMNS.no, COLUMNS.sku, COLUMNS.name(56), COLUMNS.qty, COLUMNS.price, COLUMNS.sum],
    },
    h, lines, t,
  );
}
