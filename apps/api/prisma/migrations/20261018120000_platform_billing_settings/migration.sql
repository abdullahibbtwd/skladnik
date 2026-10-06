-- Platform billing seller identity (editable in console; replaces INVOICE_SELLER_* env).

CREATE TABLE "PlatformBillingSettings" (
  "id" TEXT NOT NULL,
  "sellerName" TEXT NOT NULL DEFAULT '',
  "sellerEik" TEXT NOT NULL DEFAULT '',
  "sellerAddress" TEXT NOT NULL DEFAULT '',
  "sellerEmail" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedByAdminId" TEXT,

  CONSTRAINT "PlatformBillingSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformBillingSettings"
  ADD CONSTRAINT "PlatformBillingSettings_updatedByAdminId_fkey"
  FOREIGN KEY ("updatedByAdminId") REFERENCES "PlatformAdmin"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PlatformBillingSettings" ("id", "sellerName", "sellerEik", "sellerAddress", "sellerEmail", "updatedAt")
VALUES ('default', 'Skladnik EOOD', '000000000', 'Sofia, Bulgaria', 'billing@example.com', CURRENT_TIMESTAMP);
