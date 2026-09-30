-- A reversal movement points at the movement it undoes; each movement can be undone once.
ALTER TABLE "StockMovement" ADD COLUMN "reversalOfId" TEXT;

CREATE UNIQUE INDEX "StockMovement_reversalOfId_key" ON "StockMovement"("reversalOfId");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
