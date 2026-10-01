-- SKL-09: normalised document number for duplicate detection (reversible: DROP COLUMN).
ALTER TABLE "Document" ADD COLUMN "numberKey" TEXT NOT NULL DEFAULT '';

-- Approximate the shared normalizeDocumentNumber() in SQL for existing rows.
UPDATE "Document"
SET "numberKey" = COALESCE(
  NULLIF(
    regexp_replace(
      regexp_replace(lower(trim("number")), '[-/.\s]+', '', 'g'),
      '^0+',
      ''
    ),
    ''
  ),
  '0'
);

CREATE INDEX "Document_companyId_partnerId_type_numberKey_idx"
  ON "Document"("companyId", "partnerId", "type", "numberKey");
