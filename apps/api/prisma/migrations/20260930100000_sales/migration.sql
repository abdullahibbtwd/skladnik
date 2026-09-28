-- Stage 4a sales: till sales as SALE documents, voids as reversing documents.

ALTER TYPE "DocumentType" ADD VALUE 'SALE';

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

ALTER TABLE "Document"
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "reversalOfId" TEXT,
  ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Document_reversalOfId_key" ON "Document"("reversalOfId");
CREATE UNIQUE INDEX "Document_companyId_clientRequestId_key" ON "Document"("companyId", "clientRequestId");
CREATE INDEX "Document_companyId_type_postedAt_idx" ON "Document"("companyId", "type", "postedAt");
CREATE INDEX "Document_siteId_type_postedAt_idx" ON "Document"("siteId", "type", "postedAt");

ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
