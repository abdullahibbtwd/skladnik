-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'REVIEW';

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PCS', 'PACK', 'KG', 'CASE', 'CARTON', 'JAR', 'OTHER');

-- Product: string unit → enum, pending-review queue, pack size
ALTER TABLE "Product" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "unit" TYPE "UnitOfMeasure" USING (
  CASE
    WHEN lower("unit") IN ('pcs', 'pc', 'бр', 'бр.', 'брой') THEN 'PCS'::"UnitOfMeasure"
    WHEN lower("unit") IN ('pack', 'пак', 'пакет') THEN 'PACK'::"UnitOfMeasure"
    WHEN lower("unit") IN ('kg', 'кг', 'килограм') THEN 'KG'::"UnitOfMeasure"
    WHEN lower("unit") IN ('case', 'стек') THEN 'CASE'::"UnitOfMeasure"
    WHEN lower("unit") IN ('carton', 'кашон') THEN 'CARTON'::"UnitOfMeasure"
    WHEN lower("unit") IN ('jar', 'буркан') THEN 'JAR'::"UnitOfMeasure"
    ELSE 'PCS'::"UnitOfMeasure"
  END
);
ALTER TABLE "Product" ALTER COLUMN "unit" SET DEFAULT 'PCS'::"UnitOfMeasure";

ALTER TABLE "Product"
  ADD COLUMN "packSize" DECIMAL(12,3) NOT NULL DEFAULT 1,
  ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "createdFromDocumentId" TEXT;

CREATE INDEX "Product_companyId_status_idx" ON "Product"("companyId", "status");
CREATE INDEX "Product_createdFromDocumentId_idx" ON "Product"("createdFromDocumentId");

-- Partner header fields from invoices
ALTER TABLE "Partner"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "mol" TEXT,
  ADD COLUMN "phone" TEXT;

CREATE UNIQUE INDEX "Partner_companyId_taxId_key" ON "Partner"("companyId", "taxId");

-- Document header + stock direction
ALTER TABLE "Document"
  ADD COLUMN "direction" "StockDirection" NOT NULL DEFAULT 'IN',
  ADD COLUMN "deliveryAddress" TEXT;

CREATE INDEX "Document_companyId_status_idx" ON "Document"("companyId", "status");

-- DocumentLine: invoice columns, OCR snapshots, line-level verify
ALTER TABLE "DocumentLine"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "supplierProductCode" TEXT,
  ADD COLUMN "ocrDescription" TEXT,
  ADD COLUMN "ocrUnit" TEXT,
  ADD COLUMN "unit" "UnitOfMeasure",
  ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "finalUnitPrice" DECIMAL(12,4),
  ADD COLUMN "lineTotal" DECIMAL(12,4),
  ADD COLUMN "ocrBatchNumber" TEXT,
  ADD COLUMN "ocrExpiryDate" DATE,
  ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "DocumentLine" AS dl
SET "companyId" = d."companyId"
FROM "Document" AS d
WHERE d."id" = dl."documentId";

DELETE FROM "DocumentLine" WHERE "companyId" IS NULL;

ALTER TABLE "DocumentLine" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DocumentLine" ALTER COLUMN "productId" DROP NOT NULL;

CREATE INDEX "DocumentLine_companyId_idx" ON "DocumentLine"("companyId");
CREATE INDEX "DocumentLine_documentId_verified_idx" ON "DocumentLine"("documentId", "verified");

-- CreateTable
CREATE TABLE "SupplierProductCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProductCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierProductCode_companyId_partnerId_supplierCode_key" ON "SupplierProductCode"("companyId", "partnerId", "supplierCode");
CREATE INDEX "SupplierProductCode_productId_idx" ON "SupplierProductCode"("productId");
CREATE INDEX "SupplierProductCode_partnerId_idx" ON "SupplierProductCode"("partnerId");

-- CreateTable
CREATE TABLE "UnitAlias" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitAlias_companyId_raw_key" ON "UnitAlias"("companyId", "raw");
CREATE INDEX "UnitAlias_companyId_idx" ON "UnitAlias"("companyId");

-- CreateTable
CREATE TABLE "DocumentCapture" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "imageKey" TEXT NOT NULL,
    "ocrRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentCapture_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentCapture_documentId_pageNumber_key" ON "DocumentCapture"("documentId", "pageNumber");
CREATE INDEX "DocumentCapture_companyId_idx" ON "DocumentCapture"("companyId");

-- Foreign keys
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdFromDocumentId_fkey" FOREIGN KEY ("createdFromDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierProductCode" ADD CONSTRAINT "SupplierProductCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProductCode" ADD CONSTRAINT "SupplierProductCode_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProductCode" ADD CONSTRAINT "SupplierProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitAlias" ADD CONSTRAINT "UnitAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentCapture" ADD CONSTRAINT "DocumentCapture_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentCapture" ADD CONSTRAINT "DocumentCapture_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
