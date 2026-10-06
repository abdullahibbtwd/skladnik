-- Platform operator identity + company subscriptions / activation codes.
-- Partial unique index, CHECKs, and append-only triggers are intentional SQL
-- (not expressible in the Prisma schema DSL).

-- Enums -----------------------------------------------------------------------

CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'PRO', 'MULTI_LOCATION');

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'PENDING',
  'TRIAL',
  'ACTIVE',
  'GRANDFATHERED',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED'
);

CREATE TYPE "SubscriptionEventType" AS ENUM (
  'CREATED',
  'STATUS_CHANGED',
  'LIMITS_CHANGED',
  'ACTIVATED',
  'CODE_ISSUED',
  'CODE_REVOKED',
  'EXTENDED',
  'NOTE'
);

CREATE TYPE "SubscriptionEventActor" AS ENUM ('PLATFORM_ADMIN', 'USER', 'SYSTEM');

-- PlatformAdmin ---------------------------------------------------------------

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- Subscription ----------------------------------------------------------------

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "companyNameHint" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "externalInvoiceRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByAdminId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_companyId_idx" ON "Subscription"("companyId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_createdAt_idx" ON "Subscription"("createdAt");

-- One live entitlement row per company (PENDING / REVOKED do not count).
CREATE UNIQUE INDEX "Subscription_one_live_per_company"
  ON "Subscription"("companyId")
  WHERE "companyId" IS NOT NULL
    AND "status" IN ('TRIAL', 'ACTIVE', 'GRANDFATHERED', 'EXPIRED', 'SUSPENDED');

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_maxUsers_check" CHECK ("maxUsers" >= 1),
  ADD CONSTRAINT "Subscription_termMonths_check" CHECK ("termMonths" >= 1),
  ADD CONSTRAINT "Subscription_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "Subscription_pending_unbound_check" CHECK (
    ("status" = 'PENDING' AND "companyId" IS NULL)
    OR ("status" <> 'PENDING')
  ),
  ADD CONSTRAINT "Subscription_live_bound_check" CHECK (
    ("status" IN ('TRIAL', 'ACTIVE', 'GRANDFATHERED', 'EXPIRED', 'SUSPENDED') AND "companyId" IS NOT NULL)
    OR ("status" NOT IN ('TRIAL', 'ACTIVE', 'GRANDFATHERED', 'EXPIRED', 'SUSPENDED'))
  );

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Subscription_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Subscription_activatedByUserId_fkey"
    FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ActivationCode --------------------------------------------------------------

CREATE TABLE "ActivationCode" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "redeemedCompanyId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivationCode_codeHash_key" ON "ActivationCode"("codeHash");
CREATE INDEX "ActivationCode_subscriptionId_idx" ON "ActivationCode"("subscriptionId");
CREATE INDEX "ActivationCode_codePrefix_idx" ON "ActivationCode"("codePrefix");

ALTER TABLE "ActivationCode"
  ADD CONSTRAINT "ActivationCode_codeHash_check" CHECK (char_length("codeHash") = 64),
  ADD CONSTRAINT "ActivationCode_failedAttempts_check" CHECK ("failedAttempts" >= 0),
  ADD CONSTRAINT "ActivationCode_redeemed_consistency_check" CHECK (
    ("redeemedAt" IS NULL AND "redeemedByUserId" IS NULL AND "redeemedCompanyId" IS NULL)
    OR ("redeemedAt" IS NOT NULL AND "redeemedCompanyId" IS NOT NULL)
  );

ALTER TABLE "ActivationCode"
  ADD CONSTRAINT "ActivationCode_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivationCode_redeemedByUserId_fkey"
    FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivationCode_redeemedCompanyId_fkey"
    FOREIGN KEY ("redeemedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SubscriptionEvent (append-only) ---------------------------------------------

CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" "SubscriptionEventType" NOT NULL,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus",
    "actorType" "SubscriptionEventActor" NOT NULL,
    "actorId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx"
  ON "SubscriptionEvent"("subscriptionId", "createdAt");

ALTER TABLE "SubscriptionEvent"
  ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION subscription_event_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Subscription events are append-only: entries cannot be changed';
  END IF;
  IF EXISTS (SELECT 1 FROM "Subscription" WHERE "id" = OLD."subscriptionId") THEN
    RAISE EXCEPTION 'Subscription events are append-only: entries cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SubscriptionEvent_append_only"
  BEFORE UPDATE OR DELETE ON "SubscriptionEvent"
  FOR EACH ROW EXECUTE FUNCTION subscription_event_append_only();

-- PlatformAuditLog (append-only) ----------------------------------------------

CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_adminId_createdAt_idx" ON "PlatformAuditLog"("adminId", "createdAt");
CREATE INDEX "PlatformAuditLog_entityType_entityId_idx" ON "PlatformAuditLog"("entityType", "entityId");

ALTER TABLE "PlatformAuditLog"
  ADD CONSTRAINT "PlatformAuditLog_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION platform_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Deleting an admin nulls adminId (ON DELETE SET NULL); nothing else may change.
    IF NEW."adminId" IS NULL
       AND (NEW."id", NEW."action", NEW."entityType", NEW."entityId",
            NEW."before"::text, NEW."after"::text, NEW."metadata"::text, NEW."createdAt")
           IS NOT DISTINCT FROM
           (OLD."id", OLD."action", OLD."entityType", OLD."entityId",
            OLD."before"::text, OLD."after"::text, OLD."metadata"::text, OLD."createdAt") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Platform audit log is append-only: entries cannot be changed';
  END IF;
  RAISE EXCEPTION 'Platform audit log is append-only: entries cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformAuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "PlatformAuditLog"
  FOR EACH ROW EXECUTE FUNCTION platform_audit_log_append_only();
