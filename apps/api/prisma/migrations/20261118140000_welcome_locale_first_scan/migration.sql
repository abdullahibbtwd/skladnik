-- AlterTable
ALTER TABLE "Company" ADD COLUMN "firstScanAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "User" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
