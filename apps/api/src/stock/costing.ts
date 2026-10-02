/** Ledger totals for one site, grouped by product and batch (batchId null = movements without a batch). */
export type LedgerCostRow = {
  productId: string;
  batchId: string | null;
  onHand: number;
  /** Quantity and value of IN movements that carry a unit cost. */
  inQty: number;
  inValue: number;
};

type BatchState = { onHand: number; inQty: number; inValue: number };

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Costs at one site, in posting order.
 * - Every product keeps a moving weighted average: each IN re-weights it, OUT leaves it unchanged.
 * - A batch is valued at the average cost of what came in under that batch (specific identification),
 *   so issuing an expensive batch doesn't make the cheap one look expensive.
 * Missing history falls back to the average, then to the catalog purchase price.
 */
export class CostBook {
  private readonly products = new Map<string, { loose: number; batches: Map<string, BatchState> }>();
  private readonly changed = new Set<string>();

  constructor(
    rows: LedgerCostRow[],
    private readonly averages: Map<string, number>,
    private readonly fallback: Map<string, number>,
  ) {
    for (const row of rows) {
      const product = this.product(row.productId);
      if (row.batchId === null) {
        product.loose = round3(product.loose + (Number(row.onHand) || 0));
      } else {
        const batch = this.batch(row.productId, row.batchId);
        batch.onHand = round3(batch.onHand + (Number(row.onHand) || 0));
        batch.inQty += Number(row.inQty) || 0;
        batch.inValue += Number(row.inValue) || 0;
      }
    }
  }

  private product(productId: string) {
    let product = this.products.get(productId);
    if (!product) {
      product = { loose: 0, batches: new Map() };
      this.products.set(productId, product);
    }
    return product;
  }

  private batch(productId: string, batchId: string) {
    const batches = this.product(productId).batches;
    let batch = batches.get(batchId);
    if (!batch) {
      batch = { onHand: 0, inQty: 0, inValue: 0 };
      batches.set(batchId, batch);
    }
    return batch;
  }

  /** Without a batchId: the product's total on hand across all batches. */
  onHand(productId: string, batchId?: string | null): number {
    const product = this.products.get(productId);
    if (!product) return 0;
    if (batchId === undefined) {
      let total = product.loose;
      for (const batch of product.batches.values()) total += batch.onHand;
      return round3(total);
    }
    if (batchId === null) return product.loose;
    return product.batches.get(batchId)?.onHand ?? 0;
  }

  average(productId: string): number {
    const avg = this.averages.get(productId) ?? this.fallback.get(productId) ?? 0;
    return Number.isFinite(avg) ? avg : 0;
  }

  unitCost(productId: string, batchId: string | null): number {
    if (batchId) {
      const batch = this.products.get(productId)?.batches.get(batchId);
      if (batch && batch.inQty > 0) {
        const cost = round4(batch.inValue / batch.inQty);
        if (Number.isFinite(cost)) return cost;
      }
    }
    return this.average(productId);
  }

  receive(productId: string, batchId: string | null, quantity: number, unitCost: number) {
    this.reweight(productId, quantity, unitCost);
    this.adjust(productId, batchId, quantity);
    if (batchId !== null) {
      const batch = this.batch(productId, batchId);
      batch.inQty += quantity;
      batch.inValue += quantity * unitCost;
    }
  }

  /** Puts back stock that left at `unitCost` (undoing an OUT). The average takes it back; the batch cost doesn't change. */
  restore(productId: string, batchId: string | null, quantity: number, unitCost: number) {
    this.reweight(productId, quantity, unitCost);
    this.adjust(productId, batchId, quantity);
  }

  /**
   * Undoes a receipt: the quantity and its value come back out of the batch cost and the average, as if it
   * never came in. When the rest was already issued at the old average, the average is left alone rather
   * than going negative.
   */
  unreceive(productId: string, batchId: string | null, quantity: number, unitCost: number) {
    const before = this.onHand(productId);
    const remaining = round3(before - quantity);
    if (remaining > 0) {
      const average = (before * this.average(productId) - quantity * unitCost) / remaining;
      if (average >= 0) {
        this.averages.set(productId, round4(average));
        this.changed.add(productId);
      }
    }
    this.adjust(productId, batchId, -quantity);
    if (batchId !== null) {
      const batch = this.batch(productId, batchId);
      batch.inQty = Math.max(0, batch.inQty - quantity);
      batch.inValue = batch.inQty > 0 ? Math.max(0, batch.inValue - quantity * unitCost) : 0;
    }
  }

  private reweight(productId: string, quantity: number, unitCost: number) {
    const before = this.onHand(productId);
    const prior = this.averages.get(productId) ?? this.fallback.get(productId) ?? unitCost;
    const average = before <= 0 ? unitCost : (before * prior + quantity * unitCost) / (before + quantity);
    this.averages.set(productId, round4(average));
    this.changed.add(productId);
  }

  private adjust(productId: string, batchId: string | null, quantity: number) {
    if (batchId === null) {
      const product = this.product(productId);
      product.loose = round3(product.loose + quantity);
    } else {
      const batch = this.batch(productId, batchId);
      batch.onHand = round3(batch.onHand + quantity);
    }
  }

  /** Takes stock out and returns the unit cost it leaves at. */
  issue(productId: string, batchId: string | null, quantity: number): number {
    const cost = this.unitCost(productId, batchId);
    this.adjust(productId, batchId, -quantity);
    return cost;
  }

  /** Stock value: batches at their own cost, stock without a batch at the average. Negative stock counts as zero. */
  value(productId: string): number {
    const product = this.products.get(productId);
    if (!product) return 0;
    let value = Math.max(0, product.loose) * this.average(productId);
    for (const [batchId, batch] of product.batches) {
      value += Math.max(0, batch.onHand) * this.unitCost(productId, batchId);
    }
    return round4(value);
  }

  changedAverages(): [string, number][] {
    return [...this.changed].map((productId) => [productId, this.averages.get(productId)!]);
  }
}
