import { BARCODE_PREFIX, ean13FromSku } from '../domain/barcode';
import type { RawLine } from './types';

/** Our EAN-13 ("48260770" + 4-digit SKU + valid check digit) → SKU; anything else → null. */
export function skuFromBarcode(barcode: string): string | null {
  const b = barcode.trim();
  if (!/^\d{13}$/.test(b) || !b.startsWith(BARCODE_PREFIX)) return null;
  const sku = b.slice(8, 12);
  return ean13FromSku(sku) === b ? sku : null;
}

export type MatchedLine = RawLine & { sku: string };

/**
 * Barcode wins over a remembered code. A code is learned only if all its rows with our barcode agree on one SKU;
 * otherwise it is reported in `conflicts` and nothing is remembered for it.
 */
export function matchLines(lines: RawLine[], known: Map<string, string>) {
  const fromBarcode = new Map<string, Set<string>>();
  for (const l of lines) {
    const sku = skuFromBarcode(l.barcode);
    if (sku) fromBarcode.set(l.code, (fromBarcode.get(l.code) ?? new Set()).add(sku));
  }
  const learned = new Map<string, string>();
  const conflicts: string[] = [];
  for (const [code, skus] of fromBarcode) {
    if (skus.size === 1) { const [sku] = skus; if (known.get(code) !== sku) learned.set(code, sku!); }
    else conflicts.push(code);
  }
  const matched: MatchedLine[] = [];
  const unmatched: RawLine[] = [];
  for (const l of lines) {
    const sku = skuFromBarcode(l.barcode) ?? (conflicts.includes(l.code) ? null : learned.get(l.code) ?? known.get(l.code) ?? null);
    if (sku) matched.push({ ...l, sku }); else unmatched.push(l);
  }
  return { matched, unmatched, learned, conflicts };
}
