-- AlterTable
ALTER TABLE "DocumentLine" ADD COLUMN "ocrBarcode" TEXT;

-- AlterTable
ALTER TABLE "DocumentCapture" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
