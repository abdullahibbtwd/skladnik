/**
 * SKL-15: automatic batch numbers when expiry is set and batch is empty.
 * Product decision (recommended default): "A-" + YYYYMMDD + "-" + seq,
 * unique per product + site + expiry (seq increments within that scope).
 */
import type { PrismaClient } from '@prisma/client';

type Db = Pick<PrismaClient, 'batch' | 'documentLine'>;

const AUTO_PREFIX = 'A-';

export function isAutomaticBatchNumber(batchNumber: string): boolean {
  return /^A-\d{8}-\d+$/.test(batchNumber.trim());
}

export function formatAutomaticBatchNumber(expiryYmd: string, seq: number): string {
  const ymd = expiryYmd.replace(/-/g, '').slice(0, 8);
  return `${AUTO_PREFIX}${ymd}-${String(seq).padStart(2, '0')}`;
}

function parseSeq(batchNumber: string, prefix: string): number | null {
  if (!batchNumber.startsWith(prefix)) return null;
  const tail = batchNumber.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return null;
  return Number(tail);
}

/**
 * Next A-YYYYMMDD-NN for this product at a site for the given expiry.
 * Considers existing Batch rows and open document lines at the site.
 */
export async function nextAutomaticBatchNumber(
  db: Db,
  args: { companyId: string; productId: string; siteId: string; expiryDate: string },
): Promise<string> {
  const ymd = args.expiryDate.slice(0, 10);
  const prefix = `${AUTO_PREFIX}${ymd.replace(/-/g, '')}-`;

  const [batches, lines] = await Promise.all([
    db.batch.findMany({
      where: { companyId: args.companyId, productId: args.productId, batchNumber: { startsWith: prefix } },
      select: { batchNumber: true },
    }),
    db.documentLine.findMany({
      where: {
        companyId: args.companyId,
        productId: args.productId,
        ocrBatchNumber: { startsWith: prefix },
        ocrExpiryDate: new Date(ymd),
        document: {
          companyId: args.companyId,
          siteId: args.siteId,
          status: { in: ['DRAFT', 'REVIEW'] },
        },
      },
      select: { ocrBatchNumber: true },
    }),
  ]);

  let max = 0;
  for (const row of batches) {
    const seq = parseSeq(row.batchNumber, prefix);
    if (seq !== null) max = Math.max(max, seq);
  }
  for (const row of lines) {
    const seq = parseSeq(row.ocrBatchNumber ?? '', prefix);
    if (seq !== null) max = Math.max(max, seq);
  }

  return formatAutomaticBatchNumber(ymd, max + 1);
}
