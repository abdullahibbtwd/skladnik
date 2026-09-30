-- Trustworthy invoice numbers (QA F-02, F-05, F-08).

-- Payment terms printed on supplier documents.
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE 'OTHER';

-- Printed taxable base, VAT and grand total, reconciled against the lines before posting.
ALTER TABLE "Document" ADD COLUMN "printedTaxableBase" DECIMAL(14,2),
ADD COLUMN "printedVatAmount" DECIMAL(14,2),
ADD COLUMN "printedTotal" DECIMAL(14,2);

-- What OCR read as the line total; the stored lineTotal is always calculated.
ALTER TABLE "DocumentLine" ADD COLUMN "ocrLineTotal" DECIMAL(12,4);

-- A document number is only unique per partner and type (checked in the application, where cancelled
-- documents are ignored and the clash can point at the existing document).
DROP INDEX "Document_companyId_number_key";
CREATE INDEX "Document_companyId_number_idx" ON "Document"("companyId", "number");

-- Open documents may still carry totals copied from OCR. Keep what was read and recalculate.
UPDATE "DocumentLine" AS l
SET "ocrLineTotal" = l."lineTotal"
FROM "Document" AS d
WHERE d."id" = l."documentId"
  AND d."status" IN ('DRAFT', 'REVIEW')
  AND l."sourceCaptureId" IS NOT NULL;

UPDATE "DocumentLine" AS l
SET "finalUnitPrice" = ROUND(l."unitPrice" * (1 - LEAST(GREATEST(l."discountPercent", 0), 100) / 100), 4),
    "lineTotal" = ROUND(ROUND(l."unitPrice" * (1 - LEAST(GREATEST(l."discountPercent", 0), 100) / 100), 4) * l."quantity", 4)
FROM "Document" AS d
WHERE d."id" = l."documentId"
  AND d."status" IN ('DRAFT', 'REVIEW')
  AND d."type" NOT IN ('STOCKTAKE', 'SALE');

-- Reverse (manual; enum values BANK_TRANSFER / OTHER cannot be dropped in Postgres):
--   UPDATE "DocumentLine" SET "lineTotal" = "ocrLineTotal" WHERE "ocrLineTotal" IS NOT NULL;
--   ALTER TABLE "DocumentLine" DROP COLUMN "ocrLineTotal";
--   ALTER TABLE "Document" DROP COLUMN "printedTaxableBase", DROP COLUMN "printedVatAmount", DROP COLUMN "printedTotal";
--   DROP INDEX "Document_companyId_number_idx";
--   CREATE UNIQUE INDEX "Document_companyId_number_key" ON "Document"("companyId", "number");
