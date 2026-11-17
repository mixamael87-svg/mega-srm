import type { DocLine } from './types';

/** What is drawn on one 37.5 × 40 mm label. `barcode` = 13 digits or '' (no barcode). */
export type LabelContent = { text: string; align: 'center' | 'left'; showMark: boolean; barcode: string };
export type LabelRecord = LabelContent & {
  id: number;
  sku: string | null;
  noPrint: boolean;
  /** Printed right after this label for every unit (e.g. "частина 2" for the 1200 series). */
  extra: (LabelContent & { noPrint: boolean }) | null;
};
export type SkippedItem = { sku: string; name: string; qty: number };
export type LabelPlan = { pages: LabelContent[]; missing: SkippedItem[]; noPrint: SkippedItem[]; printedCount: number };

const toContent = ({ text, align, showMark, barcode }: LabelContent): LabelContent => ({ text, align, showMark, barcode });

/**
 * Invoice lines → label pages. Lines of one sku (colours of a "Мікс") are summed; order = first appearance.
 * A sku without a label goes to `missing`, a `noPrint` label to `noPrint`; neither is printed.
 */
export function planLabels(lines: DocLine[], labels: LabelRecord[]): LabelPlan {
  const bySku = new Map<string, LabelRecord>();
  for (const l of labels) if (l.sku) bySku.set(l.sku, l);

  const items = new Map<string, SkippedItem>();
  for (const l of lines) {
    const it = items.get(l.sku);
    if (it) it.qty += l.qty;
    else items.set(l.sku, { sku: l.sku, name: l.name, qty: l.qty });
  }

  const plan: LabelPlan = { pages: [], missing: [], noPrint: [], printedCount: 0 };
  for (const it of items.values()) {
    const qty = Math.ceil(it.qty);
    if (qty <= 0) continue;
    const label = bySku.get(it.sku);
    if (!label) { plan.missing.push({ ...it, qty }); continue; }
    if (label.noPrint) { plan.noPrint.push({ ...it, qty }); continue; }
    const extra = label.extra && !label.extra.noPrint ? toContent(label.extra) : null;
    for (let i = 0; i < qty; i++) {
      plan.pages.push(toContent(label));
      if (extra) plan.pages.push(extra);
    }
  }
  plan.printedCount = plan.pages.length;
  return plan;
}
