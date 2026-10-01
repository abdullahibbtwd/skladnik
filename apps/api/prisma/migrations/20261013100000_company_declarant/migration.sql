-- ACC-06: VAT return declarant on the company profile (Settings → Фирма).
-- Reversible: DROP COLUMN declarant.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "declarant" TEXT;
