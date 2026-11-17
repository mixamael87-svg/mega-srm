/** Labels import, review aid: draft JSON → one PDF page per label (same renderer as printing).
 * Usage: npx tsx scripts/labels-import/render.ts <draft.json> <out.pdf> */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderLabelsPdf } from '../../src/labels/renderLabelsPdf';

type Item = { text: string; align: 'center' | 'left'; showMark: boolean; barcode: string };
const items: Item[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
writeFileSync(process.argv[3]!, await renderLabelsPdf(items.map(i => ({ text: i.text, align: i.align, showMark: i.showMark, barcode: i.barcode }))));
console.log(items.length, 'pages');
