CREATE TYPE "WriteOffReason" AS ENUM ('EXPIRED', 'DAMAGED', 'SPOILED', 'LOST', 'OTHER');

ALTER TABLE "Document"
  ADD COLUMN "writeOffReason" "WriteOffReason";
