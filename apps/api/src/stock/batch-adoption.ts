/**
 * CAF-03: switching batch tracking on must not change stock totals.
 *
 * Quantity that was received without a batch is moved into one lot named
 * "без партида" with no expiry. The move is an OUT of the loose quantity and
 * an IN of the same quantity at the same cost, so on-hand before equals on-hand after.
 * Lots that already have a batch are left alone. Zero or negative loose stock
 * is not moved.
 */
export const UNBATCHED_LOT_NAME = 'без партида';

export function adoptLooseStock(looseOnHand: number): { outQty: number; inQty: number; batchNumber: string } | null {
  const quantity = Math.round(looseOnHand * 1000) / 1000;
  if (!(quantity > 0)) return null;
  return { outQty: quantity, inQty: quantity, batchNumber: UNBATCHED_LOT_NAME };
}
