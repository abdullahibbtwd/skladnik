-- AlterEnum
ALTER TYPE "ProductStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Partner"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "bankAccount" TEXT;
