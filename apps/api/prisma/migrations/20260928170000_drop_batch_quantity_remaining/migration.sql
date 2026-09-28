-- Batch.quantityRemaining summed every site together and was never read.
-- On-hand per site and batch comes from StockMovement.
ALTER TABLE "Batch" DROP COLUMN "quantityRemaining";
