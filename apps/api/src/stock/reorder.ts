const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * How much to order so the site gets back up to its "order up to" level (maxStock, else twice minStock).
 * Only products below their minimum get a suggestion. Countable units round up to whole units.
 */
export function suggestedOrderQty(onHand: number, minStock: number, maxStock: number | null, unit: string): number | null {
  if (minStock <= 0 || onHand >= minStock) return null;
  const target = maxStock !== null && maxStock > minStock ? maxStock : minStock * 2;
  const needed = round3(target - Math.max(onHand, 0));
  if (needed <= 0) return null;
  return unit === 'KG' ? needed : Math.ceil(needed - 1e-9);
}
