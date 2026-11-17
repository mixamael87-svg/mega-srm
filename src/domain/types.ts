/** Order line as read from SalesDrive (money in UAH, floats). */
export type SdOrderLine = {
  productId: number;
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

export type SdProduct = { id: number; sku: string; name: string };

export type MixSplit = { lineIndex: number; parts: { productId: number; qty: number }[] };

/** Document line, money in kopecks. */
export type DocLine = { no: number; sku: string; name: string; barcode: string; qty: number; priceKop: number; sumKop: number };

export type DocTotals = { grossKop: number; discountKop: number; netKop: number };
