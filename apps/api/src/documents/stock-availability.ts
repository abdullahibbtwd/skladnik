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

export type StockShortfall = {
  code: 'INSUFFICIENT_STOCK';
  product: string;
  available: number;
  requested: number;
  action: 'take' | 'sell';
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

export function shortfallMessage(shortfall: StockShortfall) {
  const verb = shortfall.action === 'sell' ? 'to sell' : 'to take out';
  return `Not enough stock of ${shortfall.product}: ${shortfall.available} on hand, ${shortfall.requested} ${verb}`;
}

/** One shortfall per product/batch where the lines take out more than the site holds. */
export function stockShortfalls(lines: OutgoingLine[], onHand: Map<string, number>): StockShortfall[] {
  const demand = new Map<string, { line: OutgoingLine; quantity: number }>();
  for (const line of lines) {
    const batchNumber = line.batchTracking ? (line.batchNumber?.trim() ?? '') : null;
    const key = availabilityKey(line.productId, batchNumber);
    const current = demand.get(key);
    demand.set(key, { line, quantity: round3((current?.quantity ?? 0) + line.quantity) });
  }

  const errors: StockShortfall[] = [];
  for (const [key, { line, quantity }] of demand) {
    const available = Math.max(0, onHand.get(key) ?? 0);
    if (quantity <= available) continue;
    const product = line.batchTracking ? `${line.productName} (batch ${line.batchNumber?.trim() ?? '—'})` : line.productName;
    errors.push({ code: 'INSUFFICIENT_STOCK', product, available, requested: quantity, action: 'take' });
  }
  return errors;
}
