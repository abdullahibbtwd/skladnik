-- Annex 38 audit files (QA F-01).

-- Filings get a scope: '' company-wide (VAT return), the site id for a per-site file (Annex 38).
DROP INDEX "ComplianceFiling_companyId_kind_period_version_key";
ALTER TABLE "ComplianceFiling" ADD COLUMN "scope" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "ComplianceFiling_companyId_kind_period_scope_version_key" ON "ComplianceFiling"("companyId", "kind", "period", "scope", "version");

-- Card transaction reference taken at the till (trans_n).
ALTER TABLE "Document" ADD COLUMN "paymentReference" TEXT;

-- A site registered as an e-shop.
CREATE TABLE "EShop" (
    "siteId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "webAddress" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "cashPayment" INTEGER NOT NULL DEFAULT 3,
    "cardPayment" INTEGER NOT NULL DEFAULT 2,
    "posTerminal" TEXT,
    "paymentProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EShop_pkey" PRIMARY KEY ("siteId"),
    CONSTRAINT "EShop_type_check" CHECK ("type" IN (1, 2)),
    CONSTRAINT "EShop_cashPayment_check" CHECK ("cashPayment" BETWEEN 1 AND 6),
    CONSTRAINT "EShop_cardPayment_check" CHECK ("cardPayment" BETWEEN 1 AND 6)
);

CREATE INDEX "EShop_companyId_idx" ON "EShop"("companyId");

ALTER TABLE "EShop" ADD CONSTRAINT "EShop_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
