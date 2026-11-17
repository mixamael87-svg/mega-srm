/** Order line as read from SalesDrive (money in UAH, floats). */
export type SdOrderLine = {
  productId: number;
  /** SalesDrive product `parameter` (external id) — the same value is the offer id in the YML catalog. */
  parameter: string;
  sku: string;
  name: string;
  amount: number;
  price: number;
  /** Discount per unit, UAH. */
  discount: number;
  percentDiscount: number;
};

export type SdOrder = {
  id: number;
  orderTime: string;
  contactId: number;
  contactName: string;
  organizationId: number | null;
  lines: SdOrderLine[];
  /** Order-level discount, UAH. */
  discountAmount: number;
  /** Final order sum, UAH. */
  paymentAmount: number;
};

/** Catalog product from the YML export. `id` = offer id = SalesDrive product `parameter` (e.g. "893720631", "id_2022"). */
export type SdProduct = { id: string; sku: string; name: string; inStock?: number };

export type MixSplit = { lineIndex: number; parts: { variantId: string; qty: number }[] };

/** Document line, money in kopecks. */
export type DocLine = { no: number; sku: string; name: string; barcode: string; qty: number; priceKop: number; sumKop: number };

export type DocTotals = { grossKop: number; discountKop: number; netKop: number };
