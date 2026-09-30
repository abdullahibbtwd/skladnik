-- Recipe grammage (F-32): net weight/volume per stock unit, and g/ml on recipe lines.

CREATE TYPE "ContentUnit" AS ENUM ('G', 'ML');

ALTER TABLE "Product"
  ADD COLUMN "netContent" DECIMAL(12,3),
  ADD COLUMN "netContentUnit" "ContentUnit";

ALTER TABLE "RecipeIngredient"
  ADD COLUMN "quantityUnit" "ContentUnit";
