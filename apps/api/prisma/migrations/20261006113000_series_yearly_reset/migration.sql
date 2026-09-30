-- Optional yearly reset for company-issued document numbers (OWNER F-07).
-- Default stays continuous (resetYearly = false). Reversible: drop the columns.

ALTER TABLE "DocumentSeries"
  ADD COLUMN "resetYearly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastIssuedYear" INTEGER;
