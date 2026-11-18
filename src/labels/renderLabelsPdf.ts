import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LabelContent } from '../domain/labels';
import { isValidEan13 } from '../domain/barcode';
export { isValidEan13 };

const MM = 72 / 25.4;
export const PAGE_W = 37.5 * MM; // 106.30 pt
export const PAGE_H = 40 * MM; // 113.39 pt
const MARGIN = 1.2 * MM;
const BARS_H = 12;
const DIGITS_SIZE = 10.5;
const BARCODE_GAP = 2;
const BARCODE_H = BARS_H + DIGITS_SIZE + 1;
const MARK = 16;
export const TEXT_WIDTH_PT = PAGE_W - 2 * MARGIN;
export const MIN_SIZE = 4;
export const MAX_SIZE = 14;
/** Horizontal condensing tried in order; the first one giving ≥ 6 pt wins. Not below 80 %: narrower
 * letters fill in on the 203 dpi thermal printer (owner's test print, 18.11.2026 — variant D). */
const SCALES = [100, 90, 80];
const READABLE = 6;

const ASSETS = path.join(process.cwd(), 'assets');
type Assets = { font: Buffer; bold: Buffer; mark: Buffer };
let assets: Promise<Assets> | undefined;
/** SemiBold body text: Regular strokes drop out and Bold fills in on the 203 dpi printer (owner's test prints, 18.11.2026). */
const loadAssets = () =>
  (assets ??= Promise.all(['fonts/Arimo-SemiBold.ttf', 'fonts/Arimo-Bold.ttf', 'labels/conformity-mark.png'].map(f => readFile(path.join(ASSETS, f))))
    .then(([font, bold, mark]) => ({ font: font!, bold: bold!, mark: mark! })));

/** The "арт. NNNN" line is printed big and bold so the article is always easy to read. */
const ART_RE = /^\s*арт\.?\s*\d{4}\s*$/i;
export const ART_SIZE = 8;
const artSize = (size: number) => Math.max(size, ART_SIZE);

// ---------- EAN-13 ----------
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map(c => [...c].map(b => (b === '0' ? '1' : '0')).reverse().join(''));
const R = L.map(c => [...c].map(b => (b === '0' ? '1' : '0')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** 95 modules ('1' = bar) of an EAN-13 code; throws on an invalid code. */
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new Error(`Invalid EAN-13: ${code}`);
  const d = [...code].map(Number);
  const parity = PARITY[d[0]!]!;
  let m = '101';
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === 'L' ? L : G)[d[i]!]!;
  m += '01010';
  for (let i = 7; i <= 12; i++) m += R[d[i]!]!;
  return m + '101';
}

// ---------- text fitting ----------
/** Largest size in [4, 14] (step 0.25) whose measured height fits `heightPt`; 4 if none fits. */
export function fitFontSize(text: string, widthPt: number, heightPt: number, measure: (size: number) => number): number {
  void text; void widthPt;
  if (measure(MIN_SIZE) > heightPt) return MIN_SIZE;
  let lo = 0, hi = (MAX_SIZE - MIN_SIZE) * 4;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(MIN_SIZE + mid / 4) <= heightPt) lo = mid; else hi = mid - 1;
  }
  return MIN_SIZE + lo / 4;
}

type Measure = ((text: string, size: number, width: number) => number) & { wordWidth?: (word: string, size: number) => number };

function newDoc(a: Assets) {
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, info: { Title: 'Наклейки' } });
  doc.registerFont('label', a.font);
  doc.registerFont('label-bold', a.bold);
  doc.font('label');
  return doc;
}
/** Paragraphs are measured and drawn one by one: pdfkit counts a "\n" glyph into the line width,
 * which shifts centred lines left and can add an empty line. An empty paragraph = one blank line. */
function paragraphHeight(doc: PDFKit.PDFDocument, p: string, width: number, size: number): number {
  if (!p.trim()) return doc.font('label').fontSize(size).currentLineHeight(true);
  if (ART_RE.test(p)) {
    const h = doc.font('label-bold').fontSize(artSize(size)).heightOfString(p.trim(), { width, lineGap: 0 });
    doc.font('label').fontSize(size);
    return h;
  }
  return doc.font('label').fontSize(size).heightOfString(p, { width, lineGap: 0 });
}
const measurer = (doc: PDFKit.PDFDocument): Measure => {
  const m: Measure = (text, size, width) => {
    if (!text) return 0;
    return text.split('\n').reduce((h, p) => h + paragraphHeight(doc, p, width, size), 0);
  };
  m.wordWidth = (word, size) => doc.fontSize(size).widthOfString(word);
  return m;
};

let sharedMeasure: Promise<Measure> | undefined;
/** Height-measuring function for text set in the label font (no condensing); one parsed font for the process. */
export async function textMeasure(): Promise<Measure> {
  return (sharedMeasure ??= loadAssets().then(a => measurer(newDoc(a))));
}

/** With the mark, the title lines (up to the "арт. NNNN" line) sit in a narrower band beside it. */
function splitHead(c: LabelContent): { head: string; body: string } {
  if (!c.showMark) return { head: '', body: c.text };
  const lines = c.text.split('\n');
  const art = lines.slice(0, 3).findIndex(l => /арт\.?\s*\d{4}/i.test(l));
  const n = art >= 0 ? art + 1 : 1;
  return { head: lines.slice(0, n).join('\n'), body: lines.slice(n).join('\n') };
}

type Layout = { size: number; scale: number; head: string; body: string; headW: number; headH: number; bodyH: number; area: { top: number; h: number } };

function area(c: LabelContent) {
  const top = MARGIN;
  const bottom = c.barcode ? PAGE_H - MARGIN - BARCODE_H - BARCODE_GAP : PAGE_H - MARGIN;
  return { top, h: bottom - top };
}

const layoutCache = new Map<string, Layout>();
/** Layouts are pure in (content, font): cache them, bounded. */
function layout(c: LabelContent, m: Measure): Layout {
  const key = JSON.stringify([c.text, c.align, c.showMark, !!c.barcode]);
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const l = computeLayout(c, m);
  if (layoutCache.size >= 2000) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, l);
  return l;
}

function computeLayout(c: LabelContent, m: Measure): Layout {
  const { head, body } = splitHead(c);
  const a = area(c);
  const headW = c.align === 'center' ? TEXT_WIDTH_PT - 2 * (MARK + 1) : TEXT_WIDTH_PT - (MARK + 1);
  // a word wider than the line would be broken mid-word: keep every word within the width
  const words = c.text.split(/\s+/).filter(Boolean);
  const wordsFit = (size: number, scale: number) =>
    !m.wordWidth || words.every(w => m.wordWidth!(w, size) * scale / 100 <= TEXT_WIDTH_PT - 1);
  const heights = (size: number, scale: number) => {
    const k = 100 / scale; // wrap in a wider box, draw squeezed horizontally
    const headH = c.showMark ? Math.max(m(head, size, headW * k), MARK) : 0;
    return { headH, bodyH: m(body, size, TEXT_WIDTH_PT * k) };
  };
  // first condensing that gives a readable size wins; otherwise the largest size that fits;
  // if nothing fits at all — smallest size, strongest condensing (the text is clipped to its area)
  let best: { size: number; scale: number } | undefined;
  for (const scale of SCALES) {
    const size = fitFontSize(c.text, TEXT_WIDTH_PT, a.h, s => { const h = heights(s, scale); return wordsFit(s, scale) ? h.headH + h.bodyH : Infinity; });
    const h = heights(size, scale);
    if (h.headH + h.bodyH > a.h) continue;
    if (!best || size > best.size) best = { size, scale };
    if (size >= READABLE) break;
  }
  const { size, scale } = best ?? { size: MIN_SIZE, scale: SCALES[SCALES.length - 1]! };
  return { size, scale, head, body, headW, ...heights(size, scale), area: a };
}

/** Chosen font size and condensing; `fits` = false when the text overflows even at 4 pt and 55 %. */
export async function labelLayout(c: LabelContent): Promise<{ size: number; scale: number; fits: boolean; textHeight: number; artSize: number }> {
  const l = layout(c, await textMeasure());
  const hasArt = c.text.split('\n').some(p => ART_RE.test(p));
  return { size: l.size, scale: l.scale, fits: l.headH + l.bodyH <= l.area.h + 0.01, textHeight: l.headH + l.bodyH, artSize: hasArt ? artSize(l.size) : l.size };
}

/** False when the text overflows its area even at the smallest size and the strongest condensing. */
export async function labelFits(c: LabelContent): Promise<boolean> {
  return (await labelLayout(c)).fits;
}

// ---------- rendering ----------
/** PDF with one 37.5 × 40 mm page per label. */
export async function renderLabelsPdf(pages: LabelContent[]): Promise<Buffer> {
  if (pages.length === 0) throw new Error('NO_PAGES');
  const a = await loadAssets();
  const { mark } = a;
  const doc = newDoc(a);
  const m = measurer(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));

  for (const c of pages) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    const l = layout(c, m);
    const used = Math.min(l.headH + l.bodyH, l.area.h);
    let y = l.area.top + (l.area.h - used) / 2;
    doc.save();
    doc.rect(0, l.area.top, PAGE_W, l.area.h).clip(); // overflowing text never reaches the barcode
    if (c.showMark) {
      const x = c.align === 'center' ? MARGIN + MARK + 1 : MARGIN;
      const hh = m(l.head, l.size, l.headW * 100 / l.scale);
      drawText(doc, l.head, x, y + (l.headH - hh) / 2, l.headW, l.size, l.scale, c.align);
      doc.image(mark, PAGE_W - MARGIN - MARK, MARGIN, { fit: [MARK, MARK], align: 'right' });
      y += l.headH;
    }
    drawText(doc, l.body, MARGIN, y, TEXT_WIDTH_PT, l.size, l.scale, c.align);
    doc.restore();
    if (c.barcode) drawBarcode(doc, c.barcode);
  }
  doc.end();
  return done;
}

function drawText(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number, size: number, scale: number, align: 'center' | 'left') {
  if (!text) return;
  const k = scale / 100;
  doc.save();
  doc.transform(k, 0, 0, 1, x, 0); // squeeze horizontally around the box's left edge
  doc.fillColor('black');
  let yy = y;
  for (const p of text.split('\n')) {
    const h = paragraphHeight(doc, p, w / k, size);
    if (ART_RE.test(p)) doc.font('label-bold').fontSize(artSize(size)).text(p.trim(), 0, yy, { width: w / k, align, lineGap: 0 });
    else if (p.trim()) doc.font('label').fontSize(size).text(p, 0, yy, { width: w / k, align, lineGap: 0 });
    yy += h;
  }
  doc.font('label').fontSize(size);
  doc.restore();
}

function drawBarcode(doc: PDFKit.PDFDocument, code: string) {
  const modules = ean13Modules(code);
  const w = TEXT_WIDTH_PT / modules.length;
  const top = PAGE_H - MARGIN - BARCODE_H;
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let j = i;
      while (modules[j] === '1') j++;
      doc.rect(MARGIN + i * w, top, (j - i) * w, BARS_H);
      i = j;
    } else i++;
  }
  doc.fill('black');
  doc.fontSize(DIGITS_SIZE).text(code, MARGIN, top + BARS_H + 1, { width: TEXT_WIDTH_PT, align: 'center', lineBreak: false, characterSpacing: 0.8 });
}
