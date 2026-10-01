-- SKL-07: CASHIER role (reversible: migrate users off CASHIER, then DROP VALUE is not supported —
-- Postgres cannot drop enum values; leave the value in place on rollback of app code).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CASHIER';

-- SKL-15: automatic batch flag (reversible: DROP COLUMN).
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "isAutomatic" BOOLEAN NOT NULL DEFAULT false;

-- SKL-12/18: per-site product minimum (reversible: DROP TABLE).
CREATE TABLE IF NOT EXISTS "ProductSiteMin" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "minStock" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSiteMin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSiteMin_productId_siteId_key"
  ON "ProductSiteMin"("productId", "siteId");

CREATE INDEX IF NOT EXISTS "ProductSiteMin_companyId_idx" ON "ProductSiteMin"("companyId");
CREATE INDEX IF NOT EXISTS "ProductSiteMin_siteId_idx" ON "ProductSiteMin"("siteId");

DO $$ BEGIN
  ALTER TABLE "ProductSiteMin"
    ADD CONSTRAINT "ProductSiteMin_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSiteMin"
    ADD CONSTRAINT "ProductSiteMin_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSiteMin"
    ADD CONSTRAINT "ProductSiteMin_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
