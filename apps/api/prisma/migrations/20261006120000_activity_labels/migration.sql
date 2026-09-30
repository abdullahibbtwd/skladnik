-- Entries written before labels existed get the record's current number or name, so the log is readable.
-- The append-only trigger is paused for this one-off backfill and restored in the same transaction.

ALTER TABLE "ActivityLog" DISABLE TRIGGER "ActivityLog_append_only";

UPDATE "ActivityLog" a SET "entityLabel" = d."number"
FROM "Document" d
WHERE a."entityLabel" IS NULL AND a."entityType" = 'Document' AND d."id" = a."entityId" AND d."number" IS NOT NULL;

UPDATE "ActivityLog" a SET "entityLabel" = p."name"
FROM "Product" p
WHERE a."entityLabel" IS NULL AND a."entityType" = 'Product' AND p."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = p."name"
FROM "Partner" p
WHERE a."entityLabel" IS NULL AND a."entityType" = 'Partner' AND p."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = COALESCE(NULLIF(u."name", ''), u."email")
FROM "User" u
WHERE a."entityLabel" IS NULL AND a."entityType" = 'User' AND u."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = c."name"
FROM "Company" c
WHERE a."entityLabel" IS NULL AND a."entityType" = 'Company' AND c."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = s."name"
FROM "Site" s
WHERE a."entityLabel" IS NULL AND a."entityType" = 'Site' AND s."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = g."name"
FROM "ProductGroup" g
WHERE a."entityLabel" IS NULL AND a."entityType" = 'ProductGroup' AND g."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = u."raw"
FROM "UnitAlias" u
WHERE a."entityLabel" IS NULL AND a."entityType" = 'UnitAlias' AND u."id" = a."entityId";

UPDATE "ActivityLog" a SET "entityLabel" = f."kind" || ' ' || f."period"
FROM "ComplianceFiling" f
WHERE a."entityLabel" IS NULL AND a."entityType" = 'ComplianceFiling' AND f."id" = a."entityId";

UPDATE "ActivityLog" SET "entityLabel" = "entityId"
WHERE "entityLabel" IS NULL AND "entityType" = 'VatReturnInput';

ALTER TABLE "ActivityLog" ENABLE TRIGGER "ActivityLog_append_only";
