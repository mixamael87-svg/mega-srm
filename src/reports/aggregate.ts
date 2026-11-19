import type { MatchedLine } from './match';
import type { RawLine } from './types';

export type AggRow = { sku: string; priceKop: number; qty: number; opening: number; incoming: number; soldRetail: number; soldOther: number };

/** Sum repeats of (sku, price) for one store or 'ALL' stores; keeps the order of first appearance. */
export function aggregate(lines: MatchedLine[], store: string | 'ALL'): AggRow[] {
  const out = new Map<string, AggRow>();
  for (const l of lines) {
    if (store !== 'ALL' && l.store !== store) continue;
    const key = `${l.sku}|${l.priceKop}`;
    const r = out.get(key) ?? { sku: l.sku, priceKop: l.priceKop, qty: 0, opening: 0, incoming: 0, soldRetail: 0, soldOther: 0 };
    r.qty += l.qty; r.opening += l.opening ?? 0; r.incoming += l.incoming ?? 0; r.soldRetail += l.soldRetail ?? 0; r.soldOther += l.soldOther ?? 0;
    out.set(key, r);
  }
  return [...out.values()];
}

export type CodeRow = { code: string; name: string; barcode: string; priceKop: number; qty: number; opening: number; incoming: number; soldRetail: number; soldOther: number };

/** Sum repeats of (client code, price) for one store or 'ALL'; order of first appearance. */
export function aggregateByCode(lines: RawLine[], store: string | 'ALL'): CodeRow[] {
  const out = new Map<string, CodeRow>();
  for (const l of lines) {
    if (store !== 'ALL' && l.store !== store) continue;
    const key = `${l.code}|${l.priceKop}`;
    const r = out.get(key) ?? { code: l.code, name: l.name, barcode: l.barcode, priceKop: l.priceKop, qty: 0, opening: 0, incoming: 0, soldRetail: 0, soldOther: 0 };
    r.qty += l.qty; r.opening += l.opening ?? 0; r.incoming += l.incoming ?? 0; r.soldRetail += l.soldRetail ?? 0; r.soldOther += l.soldOther ?? 0;
    out.set(key, r);
  }
  return [...out.values()];
}
