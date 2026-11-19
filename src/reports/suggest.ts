import { isMixLine } from '../domain/buildDocument';
import type { SdProduct } from '../domain/types';

export const SUGGEST_MIN_SCORE = 0.35;

const norm = (s: string) => s.toLowerCase().replace(/[`'’"«»()*.,:;!?+\-–—/\\]/g, ' ').replace(/\s+/g, ' ').trim();
function trigrams(s: string): Set<string> {
  const x = ` ${norm(s)} `;
  const t = new Set<string>();
  for (let i = 0; i < x.length - 2; i++) t.add(x.slice(i, i + 3));
  return t;
}
const dice = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return (2 * i) / (a.size + b.size);
};

/**
 * Suggests our SKU for a client's product name (trigram Dice similarity against the catalog).
 * Only a hint — it is wrong about a third of the time on real reports, so the UI asks to confirm it.
 */
export function createNameIndex(products: SdProduct[]) {
  const items = products.filter(p => /^\d{4}$/.test(p.sku)).map(p => ({ p, t: trigrams(p.name) }));
  const mixName = new Map<string, string>();
  for (const p of products) if (isMixLine(p.name) && !mixName.has(p.sku)) mixName.set(p.sku, p.name);
  return {
    suggest(name: string): { sku: string; name: string; score: number } | null {
      const t = trigrams(name);
      if (norm(name).length === 0) return null;
      let best: { sku: string; score: number; mix: boolean; name: string } | null = null;
      for (const { p, t: pt } of items) {
        const score = dice(t, pt);
        const mix = isMixLine(p.name);
        if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && mix && !best.mix)) best = { sku: p.sku, score, mix, name: p.name };
      }
      if (!best || best.score < SUGGEST_MIN_SCORE) return null;
      return { sku: best.sku, name: mixName.get(best.sku) ?? best.name, score: Math.round(best.score * 100) / 100 };
    },
  };
}
