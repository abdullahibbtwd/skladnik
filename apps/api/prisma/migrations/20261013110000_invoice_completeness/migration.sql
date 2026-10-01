-- ACC-04 / ACC-14: invoice completeness signals + free-of-charge lines.
-- Reversible: DROP the added columns.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "scanFirstLineNumber" INTEGER;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "amountInWords" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "amountInWordsParsed" DECIMAL(12,2);

ALTER TABLE "DocumentLine" ADD COLUMN IF NOT EXISTS "freeOfCharge" BOOLEAN NOT NULL DEFAULT false;
