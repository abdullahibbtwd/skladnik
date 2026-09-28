export type OutgoingLine = {
  productId: string;
  productName: string;
  batchTracking: boolean;
  batchNumber: string | null;
  quantity: number;
};

export type LedgerRow = {
  productId: string;
  batchNumber: string | null;
  direction: 'IN' | 'OUT';
  quantity: number;
};

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Batch-tracked products are checked per batch; everything else per product. */
export function availabilityKey(productId: string, batchNumber: string | null) {
  return batchNumber === null ? productId : `${productId}\u0000${batchNumber}`;
}

/** On hand per product and per (product, batch) at one site, from signed ledger sums. */
export function onHandByKey(rows: LedgerRow[]): Map<string, number> {
  const result = new Map<string, number>();
  const add = (key: string, value: number) => result.set(key, round3((result.get(key) ?? 0) + value));
  for (const row of rows) {
    const signed = row.direction === 'OUT' ? -row.quantity : row.quantity;
    add(availabilityKey(row.productId, null), signed);
    if (row.batchNumber !== null) add(availabilityKey(row.productId, row.batchNumber), signed);
  }
  return result;
}

/** One message per product/batch where the lines take out more than the site holds. */
export function stockShortfalls(lines: OutgoingLine[], onHand: Map<string, number>): string[] {
  const demand = new Map<string, { line: OutgoingLine; quantity: number }>();
  for (const line of lines) {
    const batchNumber = line.batchTracking ? (line.batchNumber?.trim() ?? '') : null;
    const key = availabilityKey(line.productId, batchNumber);
    const current = demand.get(key);
    demand.set(key, { line, quantity: round3((current?.quantity ?? 0) + line.quantity) });
  }

  const errors: string[] = [];
  for (const [key, { line, quantity }] of demand) {
    const available = Math.max(0, onHand.get(key) ?? 0);
    if (quantity <= available) continue;
    const what = line.batchTracking ? `${line.productName} (batch ${line.batchNumber?.trim() ?? '—'})` : line.productName;
    errors.push(`Not enough stock of ${what}: ${available} on hand, ${quantity} to take out`);
  }
  return errors;
}
