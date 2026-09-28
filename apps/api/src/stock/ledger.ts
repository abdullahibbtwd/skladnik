import { Prisma, type PrismaClient } from '@prisma/client';
import { toNumber } from '../common/decimal';
import { CostBook, type LedgerCostRow } from './costing';

type Db = PrismaClient | Prisma.TransactionClient;

export type SiteLedgerRow = LedgerCostRow & { inTotal: number; outTotal: number; lastAt: Date | null };

/** On hand, IN cost totals and last movement per product and batch at one site. */
export async function siteLedger(db: Db, companyId: string, siteId: string, productIds?: string[]): Promise<SiteLedgerRow[]> {
  if (productIds && productIds.length === 0) return [];
  const productFilter = productIds ? Prisma.sql`AND "productId" = ANY(${productIds})` : Prisma.empty;
  const rows = await db.$queryRaw<
    { productId: string; batchId: string | null; inTotal: number; outTotal: number; inQty: number; inValue: number; lastAt: Date | null }[]
  >`
    SELECT "productId", "batchId",
      COALESCE(SUM(CASE WHEN "direction" = 'IN' THEN "quantity" END), 0)::float8 AS "inTotal",
      COALESCE(SUM(CASE WHEN "direction" = 'OUT' THEN "quantity" END), 0)::float8 AS "outTotal",
      COALESCE(SUM(CASE WHEN "direction" = 'IN' AND "unitCost" IS NOT NULL THEN "quantity" END), 0)::float8 AS "inQty",
      COALESCE(SUM(CASE WHEN "direction" = 'IN' AND "unitCost" IS NOT NULL THEN "quantity" * "unitCost" END), 0)::float8 AS "inValue",
      MAX("occurredAt") AS "lastAt"
    FROM "StockMovement"
    WHERE "companyId" = ${companyId} AND "siteId" = ${siteId} ${productFilter}
    GROUP BY "productId", "batchId"
  `;
  return rows.map((row) => ({
    ...row,
    onHand: Math.round((row.inTotal - row.outTotal) * 1000) / 1000,
  }));
}

export async function loadCostBook(db: Db, companyId: string, siteId: string, productIds?: string[]) {
  const [rows, costs, products] = await Promise.all([
    siteLedger(db, companyId, siteId, productIds),
    db.stockCost.findMany({
      where: { companyId, siteId, ...(productIds ? { productId: { in: productIds } } : {}) },
      select: { productId: true, avgCost: true },
    }),
    db.product.findMany({
      where: { companyId, ...(productIds ? { id: { in: productIds } } : {}) },
      select: { id: true, purchasePrice: true },
    }),
  ]);
  const book = new CostBook(
    rows,
    new Map(costs.map((row) => [row.productId, toNumber(row.avgCost)])),
    new Map(products.map((row) => [row.id, toNumber(row.purchasePrice)])),
  );
  return { book, rows };
}

export async function saveAverages(tx: Prisma.TransactionClient, companyId: string, siteId: string, book: CostBook) {
  for (const [productId, avgCost] of book.changedAverages()) {
    await tx.stockCost.upsert({
      where: { siteId_productId: { siteId, productId } },
      create: { companyId, siteId, productId, avgCost },
      update: { avgCost },
    });
  }
}

/** Serialises postings per site. Sites are locked in a fixed order so a transfer A→B and B→A can't deadlock. */
export async function lockSites(tx: Prisma.TransactionClient, siteIds: string[]) {
  for (const siteId of [...new Set(siteIds)].sort()) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`stock:${siteId}`}))`;
  }
}
