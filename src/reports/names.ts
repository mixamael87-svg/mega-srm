import { isMixLine } from '../domain/buildDocument';
import type { SdProduct } from '../domain/types';

/** Our name for a SKU from the SalesDrive catalog: the «Мікс» product if the SKU has colours, else the first; none → null. */
export function ourName(products: SdProduct[]): string | null {
  if (products.length === 0) return null;
  return (products.find(p => isMixLine(p.name)) ?? products[0]!).name;
}
