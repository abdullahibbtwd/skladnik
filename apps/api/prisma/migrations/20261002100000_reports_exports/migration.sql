-- Original upload (a PDF split into page images) so the accountant archive can hand over the real file.
ALTER TABLE "DocumentCapture" ADD COLUMN "sourceKey" TEXT;

-- Saved CSV layouts per report (column choice, order, headers, format) for accounting software imports.
CREATE TABLE "ExportProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportKind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "delimiter" TEXT NOT NULL DEFAULT ';',
    "decimalSeparator" TEXT NOT NULL DEFAULT ',',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
    "encoding" TEXT NOT NULL DEFAULT 'UTF8_BOM',
    "includeHeader" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExportProfile_companyId_idx" ON "ExportProfile"("companyId");
CREATE UNIQUE INDEX "ExportProfile_companyId_reportKind_name_key" ON "ExportProfile"("companyId", "reportKind", "name");

ALTER TABLE "ExportProfile" ADD CONSTRAINT "ExportProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
