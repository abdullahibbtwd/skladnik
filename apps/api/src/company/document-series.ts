import { Prisma } from '@prisma/client';
import {
  DEFAULT_SERIES_PADDING,
  DEFAULT_SERIES_PREFIX,
  DOCUMENT_SERIES,
  formatSeriesNumber,
  type DocumentSeriesKey,
  type DocumentSeriesRecord,
} from '@skladnik/shared';

type Db = Pick<Prisma.TransactionClient, 'documentSeries'>;

/** Calendar year in Europe/Sofia — document dates and yearly resets use the same zone. */
export function seriesCalendarYear(at: Date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', year: 'numeric' }).format(at));
}

/**
 * Takes the next number of a series. The upsert row-locks the series until the transaction ends, so two
 * documents created at once get consecutive numbers. `isTaken` skips numbers already used by hand.
 * When resetYearly is on and the Sofia calendar year changed, nextNumber restarts at 1.
 */
export async function takeSeriesNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  key: DocumentSeriesKey,
  isTaken: (number: string) => Promise<boolean>,
) {
  const year = seriesCalendarYear();
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    // In DO UPDATE SET, "DocumentSeries".col is the OLD row; RETURNING sees the NEW row, so
    // nextNumber - 1 is the number just issued (2 - 1 = 1 after a year rollover).
    const [row] = await tx.$queryRaw<{ prefix: string; padding: number; taken: number }[]>`
      INSERT INTO "DocumentSeries" ("companyId", "key", "prefix", "padding", "nextNumber", "resetYearly", "lastIssuedYear", "updatedAt")
      VALUES (${companyId}, ${key}, ${DEFAULT_SERIES_PREFIX[key]}, ${DEFAULT_SERIES_PADDING}, 2, false, ${year}, CURRENT_TIMESTAMP)
      ON CONFLICT ("companyId", "key")
      DO UPDATE SET
        "nextNumber" = CASE
          WHEN "DocumentSeries"."resetYearly"
               AND ("DocumentSeries"."lastIssuedYear" IS NULL OR "DocumentSeries"."lastIssuedYear" <> ${year})
            THEN 2
          ELSE "DocumentSeries"."nextNumber" + 1
        END,
        "lastIssuedYear" = ${year},
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "prefix", "padding", "nextNumber" - 1 AS "taken"`;
    const number = formatSeriesNumber(row.prefix, Number(row.taken), row.padding);
    if (!(await isTaken(number))) return number;
  }
  throw new Error(`Could not find a free number in the ${key} series`);
}

export async function seriesRecords(db: Db, companyId: string): Promise<DocumentSeriesRecord[]> {
  const rows = await db.documentSeries.findMany({ where: { companyId } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const year = seriesCalendarYear();
  return DOCUMENT_SERIES.map((key) => {
    const row = byKey.get(key);
    const prefix = row?.prefix ?? DEFAULT_SERIES_PREFIX[key];
    const padding = row?.padding ?? DEFAULT_SERIES_PADDING;
    const resetYearly = row?.resetYearly ?? false;
    const rolled = resetYearly && row?.lastIssuedYear != null && row.lastIssuedYear !== year;
    const nextNumber = rolled ? 1 : (row?.nextNumber ?? 1);
    return {
      key,
      prefix,
      padding,
      nextNumber,
      resetYearly,
      preview: formatSeriesNumber(prefix, nextNumber, padding),
    };
  });
}
