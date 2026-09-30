/**
 * Countable units must be whole numbers; only mass and volume may be fractional.
 * Spec §4.1 / F-12: pcs, pack and case are integers; decimals only for kg and litres.
 */
export const DECIMAL_UNITS: ReadonlySet<string> = new Set(['KG', 'L']);

export function allowsFractionalQuantity(unit: string) {
  return DECIMAL_UNITS.has(unit);
}

/** True when `quantity` is allowed for this unit (positive check is separate). */
export function isQuantityPrecisionOk(quantity: number, unit: string) {
  if (!Number.isFinite(quantity)) return false;
  if (allowsFractionalQuantity(unit)) {
    // Three decimal places matches stock ledger rounding.
    return Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 1e-6;
  }
  return Math.abs(quantity - Math.round(quantity)) < 1e-6;
}

export function quantityPrecisionProblem(quantity: number, unit: string, productName?: string): string | null {
  if (isQuantityPrecisionOk(quantity, unit)) return null;
  const who = productName ? `${productName}: ` : '';
  if (allowsFractionalQuantity(unit)) {
    return `${who}quantity may have at most 3 decimal places for ${unit.toLowerCase()}`;
  }
  return `${who}quantity must be a whole number for ${unit.toLowerCase()} (decimals only for kg and litres)`;
}
