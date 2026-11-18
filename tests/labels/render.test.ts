import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ean13Modules, fitFontSize, labelFits, labelLayout, renderLabelsPdf, textMeasure, TEXT_WIDTH_PT } from '../../src/labels/renderLabelsPdf';
import type { LabelContent } from '../../src/domain/labels';

const full = readFileSync(new URL('../fixtures/labels/0205.txt', import.meta.url), 'utf8').trim();
const short = 'Аквакилимок "Кит"\nарт. 0904';
const lbl = (text: string, barcode = '4826077002053', showMark = false): LabelContent => ({ text, align: 'center', showMark, barcode });
const pdfText = (b: Buffer) => b.toString('latin1');

describe('ean13Modules', () => {
  it('encodes guards and 95 modules', () => {
    const m = ean13Modules('4826077002053');
    expect(m).toHaveLength(95);
    expect(m.startsWith('101')).toBe(true);
    expect(m.slice(45, 50)).toBe('01010');
    expect(m.endsWith('101')).toBe(true);
    // first digit 4 → parity LGLLGG; second digit 8 encoded in L code 0110111
    expect(m.slice(3, 10)).toBe('0110111');
  });
  it('rejects a wrong check digit or length', () => {
    expect(() => ean13Modules('4826077002054')).toThrow();
    expect(() => ean13Modules('482607700205')).toThrow();
  });
});

describe('fitFontSize', () => {
  it('short text gets a bigger size than a full label', async () => {
    const m = await textMeasure();
    const area = { w: TEXT_WIDTH_PT, h: 70 };
    const s = fitFontSize(short, area.w, area.h, size => m(short, size, area.w));
    const f = fitFontSize(full, area.w, area.h, size => m(full, size, area.w));
    expect(s).toBeGreaterThan(f);
    expect(s).toBeLessThanOrEqual(14);
    expect(f).toBeGreaterThanOrEqual(4);
  });
  it('falls back to 4 pt when nothing fits', async () => {
    const m = await textMeasure();
    const huge = full.repeat(6);
    expect(fitFontSize(huge, TEXT_WIDTH_PT, 70, size => m(huge, size, TEXT_WIDTH_PT))).toBe(4);
    expect(await labelFits(lbl(huge))).toBe(false);
    expect(await labelFits(lbl(full, '4826077002053', true))).toBe(true);
  });
});

describe('labelLayout', () => {
  it('text that never fits gets the smallest size and the strongest condensing, and is clipped', async () => {
    const l = await labelLayout(lbl(full.repeat(6)));
    expect(l).toMatchObject({ size: 4, scale: 80, fits: false });
  });
  it('a short label has no phantom empty line after a word that fills the width', async () => {
    const l = await labelLayout(lbl('Аквакилимок\n"Сафарі"\nарт. 0921'));
    expect(l.textHeight).toBeLessThan(3.5 * l.size * 1.2);
  });

  it('text is never condensed below 80 % (narrower letters fill in on a 203 dpi thermal printer)', async () => {
    for (const t of [full, short, full + ' ' + full.slice(0, 200)]) expect((await labelLayout(lbl(t))).scale).toBeGreaterThanOrEqual(80);
  });

  it('a full label fits at a readable size', async () => {
    const l = await labelLayout(lbl(full));
    expect(l.fits).toBe(true);
    expect(l.size).toBeGreaterThanOrEqual(4.5); // variant D chosen by the owner: ≥ 80 % width, ~4.5 pt for the longest texts
  });
});

describe('labelFits speed', () => {
  it('checks 150 different full labels in well under a second each batch', async () => {
    await labelFits(lbl(full)); // warm-up: font loading
    const t = Date.now();
    for (let i = 0; i < 150; i++) await labelFits(lbl(`${full} ${i}`));
    expect(Date.now() - t).toBeLessThan(2500);
  });
});

describe('renderLabelsPdf', () => {
  it('one 37.5 × 40 mm page per label', async () => {
    const pdf = await renderLabelsPdf([lbl(full, '4826077002053', true), lbl(short, '4826077009045'), { text: 'Частина 2', align: 'left', showMark: false, barcode: '' }]);
    const s = pdfText(pdf);
    expect(s.startsWith('%PDF')).toBe(true);
    expect(s.match(/\/Type \/Page\b/g)).toHaveLength(3);
    expect(s).toMatch(/\/MediaBox \[0 0 106\.29\d* 113\.38\d*\]/);
  });
  it('refuses to render nothing', async () => {
    await expect(renderLabelsPdf([])).rejects.toThrow('NO_PAGES');
  });
});
