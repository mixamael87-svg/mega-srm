/** Kopecks → "39628,55" (2 decimals, comma, no thousands separator). */
export function formatMoney(kopecks: number): string {
  if (!Number.isSafeInteger(kopecks)) throw new RangeError(`invalid kopecks: ${kopecks}`);
  const sign = kopecks < 0 ? '-' : '';
  const abs = Math.abs(kopecks);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** 6 → "6,00" */
export function formatQty(n: number): string {
  return formatMoney(Math.round(n * 100));
}

export const MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'] as const;

/** Date → "04 листопада 2026 р." (local date parts). Prefix "від " is added by the renderer. */
export function formatDocDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()} р.`;
}
