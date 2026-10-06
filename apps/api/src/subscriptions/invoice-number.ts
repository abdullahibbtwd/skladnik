import { Prisma } from '@prisma/client';
import { seriesCalendarYear } from '../company/document-series';

/** Format: PI-YYYY-NNNNNN (year = Europe/Sofia calendar year). */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `PI-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Atomically take the next platform invoice number for the Sofia calendar year.
 * Uses INSERT … ON CONFLICT upsert so the counter row is locked until commit.
 */
export async function takeInvoiceNumber(
  tx: Prisma.TransactionClient,
  at: Date = new Date(),
): Promise<string> {
  const year = seriesCalendarYear(at);
  const [row] = await tx.$queryRaw<{ taken: number }[]>`
    INSERT INTO "InvoiceNumberCounter" ("year", "nextNumber")
    VALUES (${year}, 2)
    ON CONFLICT ("year")
    DO UPDATE SET "nextNumber" = "InvoiceNumberCounter"."nextNumber" + 1
    RETURNING "nextNumber" - 1 AS "taken"`;
  if (!row) throw new Error('Failed to allocate invoice number');
  return formatInvoiceNumber(year, Number(row.taken));
}
