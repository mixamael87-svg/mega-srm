import type { MatchedLine } from './match';

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
