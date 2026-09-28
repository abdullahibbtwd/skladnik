-- VAT ledgers and return (spec §4.7b): purchase-ledger treatment per document, company VAT details,
-- hand-filled return cells, manual ledger rows, and the archive of generated submission files.
CREATE TYPE "VatCredit" AS ENUM ('FULL', 'PARTIAL', 'NONE', 'EXCLUDED');

CREATE TYPE "VatLedger" AS ENUM ('PURCHASES', 'SALES');

ALTER TABLE "Document" ADD COLUMN "vatCredit" "VatCredit",
ADD COLUMN "vatPeriod" TEXT;

CREATE TABLE "VatSettings" (
    "companyId" TEXT NOT NULL,
    "vatNumber" TEXT,
    "legalName" TEXT,
    "declarant" TEXT,
    "branch" INTEGER NOT NULL DEFAULT 0,
    "salesGrouping" TEXT NOT NULL DEFAULT 'MONTH',
    "coefficient" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatSettings_pkey" PRIMARY KEY ("companyId")
);

CREATE TABLE "VatReturnInput" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "coefficient" DECIMAL(3,2),
    "cell70" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cell71" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cell80" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cell81" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cell82" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatReturnInput_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VatLedgerEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ledger" "VatLedger" NOT NULL,
    "period" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "partnerTaxId" TEXT,
    "partnerName" TEXT,
    "description" TEXT,
    "amounts" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "submissionRef" TEXT,
    "submittedByName" TEXT,

    CONSTRAINT "ComplianceFiling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VatReturnInput_companyId_period_key" ON "VatReturnInput"("companyId", "period");
CREATE INDEX "VatLedgerEntry_companyId_period_ledger_idx" ON "VatLedgerEntry"("companyId", "period", "ledger");
CREATE INDEX "ComplianceFiling_companyId_kind_period_idx" ON "ComplianceFiling"("companyId", "kind", "period");
CREATE UNIQUE INDEX "ComplianceFiling_companyId_kind_period_version_key" ON "ComplianceFiling"("companyId", "kind", "period", "version");

ALTER TABLE "VatSettings" ADD CONSTRAINT "VatSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VatReturnInput" ADD CONSTRAINT "VatReturnInput_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VatLedgerEntry" ADD CONSTRAINT "VatLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
