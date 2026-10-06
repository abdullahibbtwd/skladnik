-- Remove GRANDFATHERED entitlements and the status itself.
-- Demo / seed companies should not carry a fake subscription from the backfill.

-- Append-only trigger blocks DELETE/UPDATE on events; pause for this cleanup.
ALTER TABLE "SubscriptionEvent" DISABLE TRIGGER "SubscriptionEvent_append_only";

DELETE FROM "ActivationCode"
WHERE "subscriptionId" IN (
  SELECT "id" FROM "Subscription" WHERE "status" = 'GRANDFATHERED'
);

DELETE FROM "SubscriptionEvent"
WHERE "subscriptionId" IN (
  SELECT "id" FROM "Subscription" WHERE "status" = 'GRANDFATHERED'
)
OR "fromStatus" = 'GRANDFATHERED'
OR "toStatus" = 'GRANDFATHERED';

DELETE FROM "Subscription" WHERE "status" = 'GRANDFATHERED';

ALTER TABLE "SubscriptionEvent" ENABLE TRIGGER "SubscriptionEvent_append_only";

-- Drop anything that still references the old enum before rewriting it.
DROP INDEX IF EXISTS "Subscription_one_live_per_company";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_live_bound_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_pending_unbound_check";

CREATE TYPE "SubscriptionStatus_new" AS ENUM (
  'PENDING',
  'TRIAL',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED'
);

ALTER TABLE "Subscription"
  ALTER COLUMN "status" TYPE "SubscriptionStatus_new"
  USING ("status"::text::"SubscriptionStatus_new");

ALTER TABLE "SubscriptionEvent"
  ALTER COLUMN "fromStatus" TYPE "SubscriptionStatus_new"
  USING (
    CASE
      WHEN "fromStatus" IS NULL THEN NULL
      ELSE "fromStatus"::text::"SubscriptionStatus_new"
    END
  );

ALTER TABLE "SubscriptionEvent"
  ALTER COLUMN "toStatus" TYPE "SubscriptionStatus_new"
  USING (
    CASE
      WHEN "toStatus" IS NULL THEN NULL
      ELSE "toStatus"::text::"SubscriptionStatus_new"
    END
  );

DROP TYPE "SubscriptionStatus";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";

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
