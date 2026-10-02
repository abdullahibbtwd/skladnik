-- CAF-01: a printed quantity that disagrees with the stored one must be confirmed
-- before submit. Reversible: dropping the flags does not change quantities or stock.
ALTER TABLE "DocumentLine" ADD COLUMN "quantityConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentLine" ADD COLUMN "unitConfirmed" BOOLEAN NOT NULL DEFAULT false;
