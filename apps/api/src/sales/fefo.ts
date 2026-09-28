export type SellableBatch = {
  batchId: string;
  batchNumber: string;
  /** YYYY-MM-DD; null sorts last. */
  expiryDate: string | null;
  onHand: number;
};

export type SaleRequestLine = {
  productName: string;
  batchTracking: boolean;
  quantity: number;
  /** Manual override: take everything from this batch. */
  batchId?: string | null;
  /** Product on hand at the site (all batches); used for products without batch tracking. */
  onHand: number;
  batches: SellableBatch[];
};

export type Allocation = { batchId: string | null; quantity: number; expired: boolean };

export type AllocationResult = {
  allocations: Allocation[];
  /** Set when the site can't cover the quantity; nothing should be sold then. */
  shortfall: string | null;
  /** One message per expired batch the allocation takes from. */
  expired: string[];
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Expiring today is still sellable; the day after is not. */
export function isExpiredOn(expiryDate: string | null, today: string) {
  return expiryDate !== null && expiryDate < today;
}

function byExpiry(a: SellableBatch, b: SellableBatch) {
  if (a.expiryDate !== b.expiryDate) {
    if (a.expiryDate === null) return 1;
    if (b.expiryDate === null) return -1;
    return a.expiryDate < b.expiryDate ? -1 : 1;
  }
  return a.batchNumber.localeCompare(b.batchNumber);
}

function expiredMessage(productName: string, batch: SellableBatch) {
  return `${productName} (batch ${batch.batchNumber}) expired on ${batch.expiryDate}`;
}

/**
 * Decides which batches a till line takes stock from.
 * - Without batch tracking: one allocation without a batch.
 * - With a chosen batch: only that batch.
 * - Otherwise FEFO: unexpired batches earliest expiry first. Expired stock is only reached when the
 *   unexpired batches run out, and is reported so the cashier has to confirm it.
 */
export function allocateSaleLine(line: SaleRequestLine, today: string): AllocationResult {
  const quantity = round3(line.quantity);
  const short = (available: number, what: string) =>
    `Not enough stock of ${what}: ${round3(Math.max(0, available))} on hand, ${quantity} to sell`;

  if (!line.batchTracking) {
    if (quantity > round3(line.onHand)) return { allocations: [], shortfall: short(line.onHand, line.productName), expired: [] };
    return { allocations: [{ batchId: null, quantity, expired: false }], shortfall: null, expired: [] };
  }

  if (line.batchId) {
    const batch = line.batches.find((row) => row.batchId === line.batchId);
    const available = batch?.onHand ?? 0;
    const what = `${line.productName} (batch ${batch?.batchNumber ?? '—'})`;
    if (!batch || quantity > round3(available)) return { allocations: [], shortfall: short(available, what), expired: [] };
    const expired = isExpiredOn(batch.expiryDate, today);
    return {
      allocations: [{ batchId: batch.batchId, quantity, expired }],
      shortfall: null,
      expired: expired ? [expiredMessage(line.productName, batch)] : [],
    };
  }

  const stocked = line.batches.filter((batch) => batch.onHand > 0);
  const fresh = stocked.filter((batch) => !isExpiredOn(batch.expiryDate, today)).sort(byExpiry);
  // Among expired batches, the most recently expired goes first.
  const stale = stocked.filter((batch) => isExpiredOn(batch.expiryDate, today)).sort((a, b) => byExpiry(b, a));

  const allocations: Allocation[] = [];
  const expired: string[] = [];
  let remaining = quantity;
  for (const batch of [...fresh, ...stale]) {
    if (remaining <= 0) break;
    const take = round3(Math.min(remaining, batch.onHand));
    const isExpired = isExpiredOn(batch.expiryDate, today);
    allocations.push({ batchId: batch.batchId, quantity: take, expired: isExpired });
    if (isExpired) expired.push(expiredMessage(line.productName, batch));
    remaining = round3(remaining - take);
  }
  if (remaining > 0) {
    const available = stocked.reduce((sum, batch) => sum + batch.onHand, 0);
    return { allocations: [], shortfall: short(available, line.productName), expired: [] };
  }
  return { allocations, shortfall: null, expired };
}
