export type ReportKind = 'turnover' | 'stock';

/** One product row of a client report, as read (store block + client's code/name/barcode). */
export type RawLine = {
  store: string;
  code: string;
  name: string;
  barcode: string;
  priceKop: number;
  /** stock: К-сть; turnover: залишок на кінець */
  qty: number;
  opening?: number;
  incoming?: number;
  soldRetail?: number;
  soldOther?: number;
};

export type ParsedReport = {
  format: 'bagel';
  kind: ReportKind;
  client: string;
  title: string;
  /** dd.mm.yyyy */
  dateFrom: string | null;
  dateTo: string;
  stores: string[];
  lines: RawLine[];
};

export class ReportParseError extends Error {
  constructor(public readonly code: 'UNKNOWN_FORMAT' | 'TOTAL_MISMATCH', message: string) {
    super(message);
    this.name = 'ReportParseError';
  }
}
