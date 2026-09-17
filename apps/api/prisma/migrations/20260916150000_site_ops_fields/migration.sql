-- AlterTable
ALTER TABLE "Site" ADD COLUMN "address" TEXT,
ADD COLUMN "managerUserId" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "deactivatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Site_managerUserId_idx" ON "Site"("managerUserId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "revokedAt" TIMESTAMP(3);
