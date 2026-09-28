export type StockLevelStatus = 'OUT' | 'LOW' | 'OK';

export type MovementSum = {
  productId: string;
  batchId?: string | null;
  direction: 'IN' | 'OUT';
  quantity: number;
  lastAt: Date | null;
};

export type OnHand = { onHand: number; lastMovementAt: Date | null };

const STATUS_ORDER: Record<StockLevelStatus, number> = { OUT: 0, LOW: 1, OK: 2 };

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Folds per-direction ledger sums into one signed on-hand quantity per product. */
export function foldMovements(sums: MovementSum[]): Map<string, OnHand> {
  const result = new Map<string, OnHand>();
  for (const row of sums) {
    const current = result.get(row.productId) ?? { onHand: 0, lastMovementAt: null };
    const signed = row.direction === 'OUT' ? -row.quantity : row.quantity;
    const lastMovementAt =
      row.lastAt && (!current.lastMovementAt || row.lastAt > current.lastMovementAt)
        ? row.lastAt
        : current.lastMovementAt;
    result.set(row.productId, { onHand: round3(current.onHand + signed), lastMovementAt });
  }
  return result;
}

/** On-hand per batch, keyed by productId then batchId. Movements without a batch are skipped. */
export function foldBatches(sums: MovementSum[]): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const row of sums) {
    if (!row.batchId) continue;
    const batches = result.get(row.productId) ?? new Map<string, number>();
    const signed = row.direction === 'OUT' ? -row.quantity : row.quantity;
    batches.set(row.batchId, round3((batches.get(row.batchId) ?? 0) + signed));
    result.set(row.productId, batches);
  }
  return result;
}

/** Earliest expiry first; batches without a date go last. */
export function compareBatchExpiry(
  a: { expiryDate: string | null; batchNumber: string },
  b: { expiryDate: string | null; batchNumber: string },
) {
  if (a.expiryDate !== b.expiryDate) {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate < b.expiryDate ? -1 : 1;
  }
  return a.batchNumber.localeCompare(b.batchNumber);
}

export function stockLevelStatus(onHand: number, minStock: number): StockLevelStatus {
  if (onHand <= 0) return 'OUT';
  if (minStock > 0 && onHand < minStock) return 'LOW';
  return 'OK';
}

export function compareStockLevels(
  a: { status: StockLevelStatus; name: string },
  b: { status: StockLevelStatus; name: string },
) {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
}
