import type { Prisma } from '@prisma/client';

/**
 * Next rahunok number for (our FOP × year × month), starting at 1 each month.
 * Atomic upsert: concurrent transactions serialize on the counter row, so numbers are unique and gap-free;
 * a rolled-back transaction releases its number.
 * Month is taken from the document date in the server's local time (TZ=Europe/Kyiv).
 */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient, fopId: number, date: Date): Promise<number> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const rows = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "InvoiceCounter" ("fopId", "year", "month", "last")
    VALUES (${fopId}, ${year}, ${month}, 1)
    ON CONFLICT ("fopId", "year", "month") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
    RETURNING "last"`;
  const n = rows[0]?.last;
  if (typeof n !== 'number') throw new Error('invoice counter: no value returned');
  return n;
}
