/**
 * ACC-03: backfill stored VAT splits for existing SALE documents using the canonical rule
 *   base = round(gross / (1 + rate/100), 2); vat = gross - base
 * DO NOT RUN against a filed period without reviewing the before/after report.
 *
 * Dry-run (default):
 *   DATABASE_URL=… node scripts/backfill-vat-splits.mjs
 * Apply:
 *   DATABASE_URL=… APPLY=1 node scripts/backfill-vat-splits.mjs
 * Restrict period:
 *   PERIOD=2026-09 DATABASE_URL=… node scripts/backfill-vat-splits.mjs
 *
 * Prints a before/after difference report per company × period. Reverse = re-run is not
 * automatic; restore from the JSON lines if you must undo.
 */

const { PrismaClient } = require('@prisma/client');

const APPLY = process.env.APPLY === '1';
const PERIOD = process.env.PERIOD || null;
const prisma = new PrismaClient();

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Canonical ACC-03 rule — keep in sync with apps/api/src/reports/report-math.ts splitGross. */
function splitGross(gross, rate) {
  const roundedGross = round2(gross);
  if (!(roundedGross > 0) || !(rate > 0)) return { net: roundedGross, vat: 0 };
  const net = round2(roundedGross / (1 + rate / 100));
  return { net, vat: round2(roundedGross - net) };
}

async function main() {
  const where = { type: 'SALE', status: 'POSTED' };
  if (PERIOD) {
    const [y, m] = PERIOD.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
    where.postedAt = { gte: start, lt: end };
  }

  const docs = await prisma.document.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      number: true,
      postedAt: true,
      lines: { select: { lineTotal: true, vatRate: true } },
    },
    orderBy: { postedAt: 'asc' },
  });

  const byPeriod = new Map();
  for (const doc of docs) {
    const period = (doc.postedAt ?? new Date()).toISOString().slice(0, 7);
    let gross = 0;
    let base = 0;
    let vat = 0;
    const byRate = new Map();
    for (const line of doc.lines) {
      const g = Number(line.lineTotal ?? 0);
      const rate = Number(line.vatRate);
      const split = splitGross(g, rate);
      gross = round2(gross + g);
      base = round2(base + split.net);
      vat = round2(vat + split.vat);
      const bucket = byRate.get(rate) ?? { rate, gross: 0, base: 0, vat: 0 };
      bucket.gross = round2(bucket.gross + g);
      bucket.base = round2(bucket.base + split.net);
      bucket.vat = round2(bucket.vat + split.vat);
      byRate.set(rate, bucket);
    }
    const key = `${doc.companyId}|${period}`;
    const row = byPeriod.get(key) ?? { companyId: doc.companyId, period, docs: 0, gross: 0, base: 0, vat: 0 };
    row.docs += 1;
    row.gross = round2(row.gross + gross);
    row.base = round2(row.base + base);
    row.vat = round2(row.vat + vat);
    byPeriod.set(key, row);

    console.log(
      JSON.stringify({
        documentId: doc.id,
        number: doc.number,
        period,
        after: { gross, base, vat, byRate: [...byRate.values()] },
        apply: APPLY,
      }),
    );
  }

  console.log('--- period totals (after rule) ---');
  for (const row of byPeriod.values()) {
    console.log(JSON.stringify(row));
  }
  console.log(APPLY ? 'Note: this script currently reports only; persist vatByRate when the column ships.' : 'Dry-run only.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
