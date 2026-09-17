CREATE TYPE "CaptureExtractionStatus" AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "DocumentCapture"
  ADD COLUMN "extractionStatus" "CaptureExtractionStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "extractionError" TEXT,
  ADD COLUMN "confidence" TEXT;

ALTER TABLE "DocumentLine"
  ADD COLUMN "sourceCaptureId" TEXT;

CREATE INDEX "DocumentLine_sourceCaptureId_idx" ON "DocumentLine"("sourceCaptureId");

ALTER TABLE "DocumentLine"
  ADD CONSTRAINT "DocumentLine_sourceCaptureId_fkey"
  FOREIGN KEY ("sourceCaptureId") REFERENCES "DocumentCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
