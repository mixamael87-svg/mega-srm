import { ean13FromSku } from './barcode';
import type { DocLine, DocTotals, MixSplit, SdOrder, SdProduct } from './types';

export type DocumentBuildErrorCode = 'SPLIT_SUM_MISMATCH' | 'TOTAL_MISMATCH' | 'UNKNOWN_VARIANT' | 'INVALID_SPLIT';

export class DocumentBuildError extends Error {
  constructor(public readonly code: DocumentBuildErrorCode, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'DocumentBuildError';
  }
}

export const toKop = (uah: number): number => Math.round(uah * 100);

export function isMixLine(name: string): boolean {
  return /м[іи]кс/i.test(name);
}


export function buildDocumentLines(
  order: SdOrder,
  splits: MixSplit[],
  variants: Record<string, SdProduct[]>,
): { lines: DocLine[]; totals: DocTotals } {
  const splitByLine = new Map<number, MixSplit['parts']>();
  for (const s of splits) {
    const src = order.lines[s.lineIndex];
    if (!src || !isMixLine(src.name)) throw new DocumentBuildError('INVALID_SPLIT', `Рядок ${s.lineIndex + 1} не можна розбити`, { lineIndex: s.lineIndex });
    if (splitByLine.has(s.lineIndex)) throw new DocumentBuildError('INVALID_SPLIT', `Рядок ${s.lineIndex + 1} розбито двічі`, { lineIndex: s.lineIndex });
    if (s.parts.some(p => !Number.isFinite(p.qty) || p.qty < 0)) throw new DocumentBuildError('INVALID_SPLIT', `Невірна кількість у рядку ${s.lineIndex + 1}`, { lineIndex: s.lineIndex });
    const parts = s.parts.filter(p => p.qty > 0);
    if (parts.length === 0) continue; // "залишити як Мікс"
    splitByLine.set(s.lineIndex, parts);
  }

  const lines: DocLine[] = [];
  let grossKop = 0;
  let lineDiscountKop = 0;
  const push = (sku: string, name: string, qty: number, priceKop: number) => {
    const sumKop = Math.round(qty * priceKop);
    grossKop += sumKop;
    lines.push({ no: lines.length + 1, sku, name, barcode: ean13FromSku(sku), qty, priceKop, sumKop });
  };

  order.lines.forEach((l, i) => {
    const priceKop = toKop(l.price);
    lineDiscountKop += Math.round(l.amount * toKop(l.discount));
    const parts = splitByLine.get(i);
    if (!parts) return push(l.sku, l.name, l.amount, priceKop);

    const sum = parts.reduce((s, p) => s + p.qty, 0);
    if (sum !== l.amount) {
      throw new DocumentBuildError('SPLIT_SUM_MISMATCH', `«${l.name}»: розбито ${sum} з ${l.amount}`, { lineIndex: i, sum, expected: l.amount });
    }
    const allowed = (variants[l.sku] ?? []).filter(v => v.id !== l.productId && v.sku === l.sku);
    for (const p of parts) {
      const v = allowed.find(a => a.id === p.productId);
      if (!v) throw new DocumentBuildError('UNKNOWN_VARIANT', `Товар ${p.productId} не є кольором артикулу ${l.sku}`, { lineIndex: i, productId: p.productId });
      push(v.sku, v.name, p.qty, priceKop);
    }
  });

  const discountKop = toKop(order.discountAmount) + lineDiscountKop;
  const netKop = grossKop - discountKop;
  const expected = toKop(order.paymentAmount);
  if (netKop !== expected) {
    throw new DocumentBuildError('TOTAL_MISMATCH', `Сума документа не збігається із замовленням: ${netKop / 100} ≠ ${expected / 100}`, { netKop, expected });
  }
  return { lines, totals: { grossKop, discountKop, netKop } };
}
