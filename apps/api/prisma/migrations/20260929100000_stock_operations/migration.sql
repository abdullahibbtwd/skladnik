-- Stage 3 stock operations: transfers, stocktaking, opening balances, costing, traceability.

ALTER TYPE "DocumentType" ADD VALUE 'TRANSFER';
ALTER TYPE "DocumentType" ADD VALUE 'STOCKTAKE';
ALTER TYPE "DocumentType" ADD VALUE 'OPENING_BALANCE';

ALTER TABLE "Document" ADD COLUMN "targetSiteId" TEXT;
CREATE INDEX "Document_targetSiteId_idx" ON "Document"("targetSiteId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_targetSiteId_fkey" FOREIGN KEY ("targetSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentLine"
  ADD COLUMN "countedQuantity" DECIMAL(12,3),
  ADD COLUMN "expectedQuantity" DECIMAL(12,3);

ALTER TABLE "Product" ADD COLUMN "maxStock" DECIMAL(12,3);

ALTER TABLE "StockMovement"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "documentLineId" TEXT,
  ADD COLUMN "unitCost" DECIMAL(12,4);
CREATE INDEX "StockMovement_documentLineId_idx" ON "StockMovement"("documentLineId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_documentLineId_fkey" FOREIGN KEY ("documentLineId") REFERENCES "DocumentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StockCost" (
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "avgCost" DECIMAL(12,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCost_pkey" PRIMARY KEY ("siteId","productId")
);
CREATE INDEX "StockCost_companyId_idx" ON "StockCost"("companyId");
ALTER TABLE "StockCost" ADD CONSTRAINT "StockCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCost" ADD CONSTRAINT "StockCost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCost" ADD CONSTRAINT "StockCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing movements.
-- Link each movement to the line it came from (same document, product, batch and quantity).
UPDATE "StockMovement" m
SET "documentLineId" = (
  SELECT l."id" FROM "DocumentLine" l
  WHERE l."documentId" = m."documentId"
    AND l."productId" = m."productId"
    AND l."batchId" IS NOT DISTINCT FROM m."batchId"
    AND l."quantity" = m."quantity"
  ORDER BY l."position"
  LIMIT 1
)
WHERE m."documentId" IS NOT NULL;

UPDATE "StockMovement" m
SET "createdAt" = COALESCE(d."postedAt", m."occurredAt")
FROM "Document" d
WHERE d."id" = m."documentId";

-- IN at the price on the line, else the catalog purchase price.
UPDATE "StockMovement" m
SET "unitCost" = COALESCE(l."finalUnitPrice", l."unitPrice")
FROM "DocumentLine" l
WHERE l."id" = m."documentLineId" AND m."direction" = 'IN';

UPDATE "StockMovement" m
SET "unitCost" = p."purchasePrice"
FROM "Product" p
WHERE p."id" = m."productId" AND m."direction" = 'IN' AND m."unitCost" IS NULL;

-- OUT at the average IN cost of the same site, product and batch.
UPDATE "StockMovement" m
SET "unitCost" = COALESCE(
  (
    SELECT ROUND(SUM(i."quantity" * i."unitCost") / NULLIF(SUM(i."quantity"), 0), 4)
    FROM "StockMovement" i
    WHERE i."direction" = 'IN'
      AND i."siteId" = m."siteId"
      AND i."productId" = m."productId"
      AND i."batchId" IS NOT DISTINCT FROM m."batchId"
  ),
  (SELECT p."purchasePrice" FROM "Product" p WHERE p."id" = m."productId")
)
WHERE m."direction" = 'OUT';

INSERT INTO "StockCost" ("companyId", "siteId", "productId", "avgCost", "updatedAt")
SELECT "companyId", "siteId", "productId", ROUND(SUM("quantity" * "unitCost") / SUM("quantity"), 4), CURRENT_TIMESTAMP
FROM "StockMovement"
WHERE "direction" = 'IN'
GROUP BY "companyId", "siteId", "productId"
HAVING SUM("quantity") > 0;
