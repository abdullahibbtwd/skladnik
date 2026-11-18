-- AlterEnum
ALTER TYPE "QuoteRequestStatus" ADD VALUE 'CONTACTED';
ALTER TYPE "QuoteRequestStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN "statusUpdatedAt" TIMESTAMP(3);
