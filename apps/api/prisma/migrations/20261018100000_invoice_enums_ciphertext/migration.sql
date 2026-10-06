-- Checkpoint 1a: enum additions + activation-code ciphertext column.
-- Must run in its own migration so new enum labels are committed before tables use them.

CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID');

ALTER TYPE "SubscriptionEventType" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "SubscriptionEventType" ADD VALUE 'INVOICE_PAID';
ALTER TYPE "SubscriptionEventType" ADD VALUE 'INVOICE_VOIDED';
ALTER TYPE "SubscriptionEventType" ADD VALUE 'CODE_REVEALED';

ALTER TABLE "ActivationCode"
  ADD COLUMN "codeCiphertext" TEXT;

CREATE INDEX "ActivationCode_expiresAt_idx" ON "ActivationCode"("expiresAt");
