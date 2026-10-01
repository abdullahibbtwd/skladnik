-- SKL-03 / SKL-05: nullable selling price; partners confirmed from a scan start unverified.
-- Reversible: UPDATE sellingPrice SET to 0 where null; DROP verified column.

ALTER TABLE "Product" ALTER COLUMN "sellingPrice" DROP NOT NULL;

ALTER TABLE "Partner" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT true;
