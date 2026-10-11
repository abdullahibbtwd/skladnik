-- Reverse enum add: rewrite type without SUPERSEDED/QUEUED (after constraints down).
-- Prefer running 20261019110000 .../down.sql first.

UPDATE "Subscription" SET "status" = 'REVOKED' WHERE "status" IN ('SUPERSEDED', 'QUEUED');

CREATE TYPE "SubscriptionStatus_old" AS ENUM (
  'PENDING',
  'TRIAL',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED'
);

ALTER TABLE "Subscription"
  ALTER COLUMN "status" TYPE "SubscriptionStatus_old"
  USING ("status"::text::"SubscriptionStatus_old");

ALTER TABLE "SubscriptionEvent"
  ALTER COLUMN "fromStatus" TYPE "SubscriptionStatus_old"
  USING (
    CASE
      WHEN "fromStatus" IS NULL THEN NULL
      WHEN "fromStatus"::text IN ('SUPERSEDED', 'QUEUED') THEN 'REVOKED'::"SubscriptionStatus_old"
      ELSE "fromStatus"::text::"SubscriptionStatus_old"
    END
  );

ALTER TABLE "SubscriptionEvent"
  ALTER COLUMN "toStatus" TYPE "SubscriptionStatus_old"
  USING (
    CASE
      WHEN "toStatus" IS NULL THEN NULL
      WHEN "toStatus"::text IN ('SUPERSEDED', 'QUEUED') THEN 'REVOKED'::"SubscriptionStatus_old"
      ELSE "toStatus"::text::"SubscriptionStatus_old"
    END
  );

DROP TYPE "SubscriptionStatus";
ALTER TYPE "SubscriptionStatus_old" RENAME TO "SubscriptionStatus";
