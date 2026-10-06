-- Backfill: every existing company without a live subscription gets a GRANDFATHERED
-- entitlement with a real 12-month expiry (high seat cap so current usage is unaffected).

INSERT INTO "Subscription" (
  "id",
  "companyId",
  "plan",
  "status",
  "maxUsers",
  "termMonths",
  "startsAt",
  "expiresAt",
  "notes",
  "version",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  'MULTI_LOCATION'::"SubscriptionPlan",
  'GRANDFATHERED'::"SubscriptionStatus",
  100,
  12,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '12 months',
  'Backfilled grandfathered entitlement',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "Subscription" s
  WHERE s."companyId" = c."id"
    AND s."status" IN ('TRIAL', 'ACTIVE', 'GRANDFATHERED', 'EXPIRED', 'SUSPENDED')
);

INSERT INTO "SubscriptionEvent" (
  "id",
  "subscriptionId",
  "type",
  "fromStatus",
  "toStatus",
  "actorType",
  "actorId",
  "payload",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  'CREATED'::"SubscriptionEventType",
  NULL,
  'GRANDFATHERED'::"SubscriptionStatus",
  'SYSTEM'::"SubscriptionEventActor",
  NULL,
  jsonb_build_object('reason', 'grandfather_backfill', 'termMonths', 12, 'maxUsers', 100),
  CURRENT_TIMESTAMP
FROM "Subscription" s
WHERE s."status" = 'GRANDFATHERED'
  AND s."notes" = 'Backfilled grandfathered entitlement'
  AND NOT EXISTS (
    SELECT 1 FROM "SubscriptionEvent" e WHERE e."subscriptionId" = s."id"
  );
