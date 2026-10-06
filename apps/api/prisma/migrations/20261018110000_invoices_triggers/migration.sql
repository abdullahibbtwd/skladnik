-- Checkpoint 1b: invoice counter + Invoice table + immutability / status triggers.
-- Relies on InvoiceStatus + SubscriptionEventType values from 20261018100000.

-- Year-scoped sequential counter (year = calendar year in Europe/Sofia at issue time).
CREATE TABLE "InvoiceNumberCounter" (
  "year" INTEGER NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "InvoiceNumberCounter_pkey" PRIMARY KEY ("year"),
  CONSTRAINT "InvoiceNumberCounter_nextNumber_check" CHECK ("nextNumber" >= 1)
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL,
  "currency" TEXT NOT NULL,
  "vatRate" DECIMAL(7,4) NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "vatMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "lineItems" JSONB NOT NULL,
  "sellerName" TEXT NOT NULL,
  "sellerEik" TEXT NOT NULL,
  "sellerAddress" TEXT NOT NULL,
  "sellerEmail" TEXT NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerEik" TEXT NOT NULL,
  "buyerAddress" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_version_check" CHECK ("version" >= 1),
  CONSTRAINT "Invoice_subtotalMinor_check" CHECK ("subtotalMinor" >= 0),
  CONSTRAINT "Invoice_vatMinor_check" CHECK ("vatMinor" >= 0),
  CONSTRAINT "Invoice_totalMinor_check" CHECK ("totalMinor" >= 0),
  CONSTRAINT "Invoice_total_equals_parts_check" CHECK ("totalMinor" = "subtotalMinor" + "vatMinor"),
  CONSTRAINT "Invoice_vatRate_check" CHECK ("vatRate" >= 0 AND "vatRate" <= 100),
  CONSTRAINT "Invoice_paid_consistency_check" CHECK (
    ("status" = 'PAID' AND "paidAt" IS NOT NULL)
    OR ("status" <> 'PAID' AND "paidAt" IS NULL)
  ),
  CONSTRAINT "Invoice_void_consistency_check" CHECK (
    ("status" = 'VOID' AND "voidedAt" IS NOT NULL)
    OR ("status" <> 'VOID' AND "voidedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability: never DELETE; UPDATE may only change status / paidAt / voidedAt / version / updatedAt
-- along allowed edges ISSUED→PAID, ISSUED→VOID. PAID→VOID is rejected.
CREATE FUNCTION invoice_immutability() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoices cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."vatRate" IS DISTINCT FROM OLD."vatRate"
     OR NEW."subtotalMinor" IS DISTINCT FROM OLD."subtotalMinor"
     OR NEW."vatMinor" IS DISTINCT FROM OLD."vatMinor"
     OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor"
     OR NEW."lineItems" IS DISTINCT FROM OLD."lineItems"
     OR NEW."sellerName" IS DISTINCT FROM OLD."sellerName"
     OR NEW."sellerEik" IS DISTINCT FROM OLD."sellerEik"
     OR NEW."sellerAddress" IS DISTINCT FROM OLD."sellerAddress"
     OR NEW."sellerEmail" IS DISTINCT FROM OLD."sellerEmail"
     OR NEW."buyerName" IS DISTINCT FROM OLD."buyerName"
     OR NEW."buyerEik" IS DISTINCT FROM OLD."buyerEik"
     OR NEW."buyerAddress" IS DISTINCT FROM OLD."buyerAddress"
     OR NEW."buyerEmail" IS DISTINCT FROM OLD."buyerEmail"
     OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Invoice snapshot columns are immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'ISSUED' AND NEW."status" = 'PAID' THEN
      NULL; -- allowed
    ELSIF OLD."status" = 'ISSUED' AND NEW."status" = 'VOID' THEN
      NULL; -- allowed
    ELSE
      RAISE EXCEPTION 'Invalid invoice status transition: % → %', OLD."status", NEW."status";
    END IF;
  ELSIF NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
     OR NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
  THEN
    RAISE EXCEPTION 'Invoice paidAt/voidedAt cannot change without a status transition';
  END IF;

  IF NEW."version" < OLD."version" THEN
    RAISE EXCEPTION 'Invoice version cannot decrease';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Invoice_immutability"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION invoice_immutability();
