-- Batch B (step 2/2): CHECKs, uniqueness, EIK mismatch setting.
-- Reversible via sibling down.sql.

ALTER TABLE "PlatformBillingSettings"
  ADD COLUMN IF NOT EXISTS "activationEikMismatchMode" TEXT NOT NULL DEFAULT 'WARN';

ALTER TABLE "PlatformBillingSettings"
  DROP CONSTRAINT IF EXISTS "PlatformBillingSettings_activationEikMismatchMode_check";

ALTER TABLE "PlatformBillingSettings"
  ADD CONSTRAINT "PlatformBillingSettings_activationEikMismatchMode_check"
  CHECK ("activationEikMismatchMode" IN ('WARN', 'BLOCK'));

DROP INDEX IF EXISTS "Subscription_one_live_per_company";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_live_bound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_pending_unbound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_queued_bound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_superseded_bound_check";

CREATE UNIQUE INDEX "Subscription_one_live_per_company"
  ON "Subscription"("companyId")
  WHERE "companyId" IS NOT NULL
    AND "status" IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

CREATE UNIQUE INDEX "Subscription_one_queued_per_company"
  ON "Subscription"("companyId")
  WHERE "companyId" IS NOT NULL AND "status" = 'QUEUED';

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_pending_unbound_check" CHECK (
    ("status" = 'PENDING' AND "companyId" IS NULL)
    OR ("status" <> 'PENDING')
  ),
  ADD CONSTRAINT "Subscription_live_bound_check" CHECK (
    ("status" IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') AND "companyId" IS NOT NULL)
    OR ("status" NOT IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'))
  ),
  ADD CONSTRAINT "Subscription_queued_bound_check" CHECK (
    ("status" = 'QUEUED' AND "companyId" IS NOT NULL)
    OR ("status" <> 'QUEUED')
  ),
  ADD CONSTRAINT "Subscription_superseded_bound_check" CHECK (
    ("status" = 'SUPERSEDED' AND "companyId" IS NOT NULL)
    OR ("status" <> 'SUPERSEDED')
  );
