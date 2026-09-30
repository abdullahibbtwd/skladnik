-- Company profile and settings ------------------------------------------------

ALTER TABLE "Company" ADD COLUMN "address" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "eik" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "expiryWindows" INTEGER[] DEFAULT ARRAY[30, 14, 7, 3]::INTEGER[],
ADD COLUMN "mol" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "priceOverrideRoles" "UserRole"[] DEFAULT ARRAY['OWNER', 'ACCOUNTANT', 'SITE_MANAGER']::"UserRole"[],
ADD COLUMN "printTemplate" JSONB,
ADD COLUMN "vatNumber" TEXT;

-- The VAT number moves from the VAT settings to the company profile (one place for the VAT files and Annex 38).
UPDATE "Company" c
SET "vatNumber" = v."vatNumber",
    "eik" = CASE WHEN v."vatNumber" ~ '^BG\d{9}$' THEN substring(v."vatNumber" FROM 3) END
FROM "VatSettings" v
WHERE v."companyId" = c."id" AND v."vatNumber" IS NOT NULL;

ALTER TABLE "VatSettings" DROP COLUMN "vatNumber";

-- Partner: one "tax ID" becomes ЕИК + VAT number ------------------------------

ALTER TABLE "Partner" ADD COLUMN "eik" TEXT, ADD COLUMN "vatNumber" TEXT;

UPDATE "Partner"
SET "vatNumber" = CASE WHEN t.clean ~ '^[A-Z]{2}' THEN t.clean END,
    "eik" = CASE
      WHEN t.clean ~ '^BG\d{9,13}$' THEN substring(t.clean FROM 3)
      WHEN t.clean ~ '^\d+$' THEN t.clean
    END
FROM (SELECT "id", upper(regexp_replace("taxId", '[\s.\-/]', '', 'g')) AS clean FROM "Partner" WHERE "taxId" IS NOT NULL) t
WHERE t."id" = "Partner"."id";

-- "BG123…" and "123…" were two partners before; the older one keeps the ЕИК, the other keeps its VAT number.
UPDATE "Partner" p SET "eik" = NULL
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "companyId", "eik" ORDER BY "createdAt", "id") AS n
  FROM "Partner" WHERE "eik" IS NOT NULL
) d
WHERE d."id" = p."id" AND d.n > 1;

DROP INDEX "Partner_companyId_taxId_key";
ALTER TABLE "Partner" DROP COLUMN "taxId";
CREATE UNIQUE INDEX "Partner_companyId_eik_key" ON "Partner"("companyId", "eik");
CREATE INDEX "Partner_companyId_vatNumber_idx" ON "Partner"("companyId", "vatNumber");

-- Write-offs get their own document type --------------------------------------

UPDATE "Document" SET "type" = 'WRITE_OFF' WHERE "writeOffReason" IS NOT NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_write_off_reason_check"
  CHECK (("type" = 'WRITE_OFF') = ("writeOffReason" IS NOT NULL));

-- Numbering series --------------------------------------------------------------

CREATE TABLE "DocumentSeries" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("companyId","key")
);

ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Continue after the highest number already used with each default prefix (ПБ-0002 → next is ПБ-0003).
INSERT INTO "DocumentSeries" ("companyId", "key", "prefix", "padding", "nextNumber", "updatedAt")
SELECT c."id", s.key, s.prefix, 4,
  COALESCE((
    SELECT max(substring(d."number" FROM char_length(s.prefix) + 1)::bigint)
    FROM "Document" d
    WHERE d."companyId" = c."id"
      AND d."type"::text = s.doc_type
      AND (s.key <> 'DISPATCH' OR d."direction" = 'OUT')
      AND starts_with(d."number", s.prefix)
      AND substring(d."number" FROM char_length(s.prefix) + 1) ~ '^\d{1,9}$'
  ), 0) + 1,
  CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('WRITE_OFF', 'ПБ-', 'WRITE_OFF'),
  ('TRANSFER', 'ВП-', 'TRANSFER'),
  ('STOCKTAKE', 'ИНВ-', 'STOCKTAKE'),
  ('OPENING_BALANCE', 'НН-', 'OPENING_BALANCE'),
  ('DISPATCH', 'СР-', 'PROTOCOL')
) AS s(key, prefix, doc_type);

-- "Съставил": documents made in the editor never stored their author; take it from their CREATE entry.
UPDATE "Document" d SET "createdById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "ActivityLog"
  WHERE "entityType" = 'Document' AND "action" = 'CREATE' AND "userId" IS NOT NULL
  ORDER BY "entityId", "createdAt"
) a
WHERE d."createdById" IS NULL AND a."entityId" = d."id"
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = a."userId");

-- Activity log: before / after, names kept, append-only ------------------------

ALTER TABLE "ActivityLog" ADD COLUMN "after" JSONB,
ADD COLUMN "before" JSONB,
ADD COLUMN "entityLabel" TEXT,
ADD COLUMN "userName" TEXT;

UPDATE "ActivityLog" a SET "userName" = u."name" FROM "User" u WHERE u."id" = a."userId";

CREATE INDEX "ActivityLog_companyId_userId_createdAt_idx" ON "ActivityLog"("companyId", "userId", "createdAt");
CREATE INDEX "ActivityLog_companyId_entityType_createdAt_idx" ON "ActivityLog"("companyId", "entityType", "createdAt");

CREATE FUNCTION activity_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Deleting a user nulls userId (ON DELETE SET NULL); userName still says who it was. Nothing else may change.
    IF NEW."userId" IS NULL
       AND (NEW."id", NEW."companyId", NEW."userName", NEW."entityType", NEW."entityId", NEW."entityLabel",
            NEW."action", NEW."before"::text, NEW."after"::text, NEW."metadata"::text, NEW."createdAt")
           IS NOT DISTINCT FROM
           (OLD."id", OLD."companyId", OLD."userName", OLD."entityType", OLD."entityId", OLD."entityLabel",
            OLD."action", OLD."before"::text, OLD."after"::text, OLD."metadata"::text, OLD."createdAt") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'The activity log is append-only: entries cannot be changed';
  END IF;
  -- Rows go only with their company (the cascade runs after the company row is gone).
  IF EXISTS (SELECT 1 FROM "Company" WHERE "id" = OLD."companyId") THEN
    RAISE EXCEPTION 'The activity log is append-only: entries cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityLog_append_only"
  BEFORE UPDATE OR DELETE ON "ActivityLog"
  FOR EACH ROW EXECUTE FUNCTION activity_log_append_only();
