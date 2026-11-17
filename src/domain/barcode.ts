/** EAN-13 = "48260770" + 4-digit sku + check digit. Any other sku → "". */
export const BARCODE_PREFIX = '48260770';

export function ean13FromSku(sku: string): string {
  if (!/^\d{4}$/.test(sku)) return '';
  const body = BARCODE_PREFIX + sku;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}
