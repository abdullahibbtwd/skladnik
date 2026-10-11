-- Reverse Batch B constraints (enum values remain; use the enum down.sql to drop them).

ALTER TABLE "PlatformBillingSettings"
  DROP CONSTRAINT IF EXISTS "PlatformBillingSettings_activationEikMismatchMode_check";
ALTER TABLE "PlatformBillingSettings"
  DROP COLUMN IF EXISTS "activationEikMismatchMode";

DROP INDEX IF EXISTS "Subscription_one_queued_per_company";
DROP INDEX IF EXISTS "Subscription_one_live_per_company";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_live_bound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_pending_unbound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_queued_bound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_superseded_bound_check";

CREATE UNIQUE INDEX "Subscription_one_live_per_company"
  ON "Subscription"("companyId")
  WHERE "companyId" IS NOT NULL
    AND "status" IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_pending_unbound_check" CHECK (
    ("status" = 'PENDING' AND "companyId" IS NULL)
    OR ("status" <> 'PENDING')
  ),
  ADD CONSTRAINT "Subscription_live_bound_check" CHECK (
    ("status" IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') AND "companyId" IS NOT NULL)
    OR ("status" NOT IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'))
  );
