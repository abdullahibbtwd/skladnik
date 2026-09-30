import { daysUntil } from './dashboard-data';
import type { MenuDish, StockBatch, StockLevel } from './workspace-api';

export type CartLine = {
  key: string;
  productId: string;
  qty: string;
  /** '' = FEFO (the server picks); otherwise a manual batch override. */
  batchId: string;
  /** null = catalog price. */
  price: string | null;
};

export type LineTake = { batch: StockBatch | null; qty: number; expired: boolean };

export type LineProblem =
  | { kind: 'notInStock' }
  | { kind: 'qty' }
  | { kind: 'noPrice' }
  | { kind: 'short'; available: number }
  | { kind: 'ingredientShort'; name: string; unit: StockLevel['unit']; needed: number; available: number };

export type LinePlan = {
  line: CartLine;
  level: StockLevel | undefined;
  /** Set when the line is a dish sold through its recipe. */
  dish: MenuDish | undefined;
  qty: number;
  unitPrice: number;
  total: number;
  takes: LineTake[];
  expired: boolean;
  problem: LineProblem | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function parseAmount(value: string) {
  const normalized = value.trim().replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

export function batchExpired(batch: Pick<StockBatch, 'expiryDate'>) {
  return Boolean(batch.expiryDate && daysUntil(batch.expiryDate) < 0);
}

/** A dish shown in the till like a stock line: "on hand" is how many portions the ingredients allow. */
export function dishLevel(dish: MenuDish): StockLevel {
  return {
    productId: dish.id,
    name: dish.name,
    code: dish.code,
    unit: dish.unit,
    productStatus: dish.status,
    group: dish.group,
    barcodes: dish.barcodes,
    minStock: 0,
    maxStock: null,
    batchTracking: false,
    purchasePrice: 0,
    sellingPrice: dish.sellingPrice,
    vatRate: dish.vatRate,
    avgCost: null,
    value: 0,
    onHand: dish.portionsAvailable,
    status: dish.portionsAvailable > 0 ? 'OK' : 'OUT',
    suggestedOrder: null,
    lastMovementAt: null,
    batches: [],
  };
}

/**
 * Mirrors the server: lines are taken in cart order from what is left, FEFO over unexpired batches
 * first, expired stock only after that. A dish takes each ingredient the same way. Lets the till show
 * the batch and flag shortfalls before paying.
 */
export function planCart(
  lines: CartLine[],
  levelById: Map<string, StockLevel>,
  dishById: Map<string, MenuDish> = new Map(),
): LinePlan[] {
  const used = new Map<string, number>();
  const left = (key: string, onHand: number) => round3(onHand - (used.get(key) ?? 0));
  const take = (key: string, qty: number) => used.set(key, round3((used.get(key) ?? 0) + qty));

  /** Takes `qty` of a stock line (FEFO, or one batch when `batchId` is set); returns what is left when short. */
  const allocate = (level: StockLevel, qty: number, batchId = ''): { takes: LineTake[] } | { available: number } => {
    if (!level.batchTracking) {
      const available = left(level.productId, level.onHand);
      if (qty > available) return { available: Math.max(0, available) };
      take(level.productId, qty);
      return { takes: [{ batch: null, qty, expired: false }] };
    }
    if (batchId) {
      const batch = level.batches.find((row) => row.batchId === batchId);
      const available = batch ? left(`${level.productId}:${batch.batchId}`, batch.onHand) : 0;
      if (!batch || qty > available) return { available: Math.max(0, available) };
      take(`${level.productId}:${batch.batchId}`, qty);
      return { takes: [{ batch, qty, expired: batchExpired(batch) }] };
    }
    const withStock = level.batches.filter((batch) => left(`${level.productId}:${batch.batchId}`, batch.onHand) > 0);
    const ordered = [...withStock.filter((batch) => !batchExpired(batch)), ...withStock.filter(batchExpired).reverse()];
    let remaining = qty;
    const takes: LineTake[] = [];
    for (const batch of ordered) {
      if (remaining <= 0) break;
      const qtyHere = round3(Math.min(remaining, left(`${level.productId}:${batch.batchId}`, batch.onHand)));
      takes.push({ batch, qty: qtyHere, expired: batchExpired(batch) });
      remaining = round3(remaining - qtyHere);
    }
    if (remaining > 0) {
      const available = withStock.reduce((sum, batch) => sum + left(`${level.productId}:${batch.batchId}`, batch.onHand), 0);
      return { available: round3(available) };
    }
    takes.forEach((row) => take(`${level.productId}:${row.batch!.batchId}`, row.qty));
    return { takes };
  };

  return lines.map((line) => {
    const dish = dishById.get(line.productId);
    const level = dish ? dishLevel(dish) : levelById.get(line.productId);
    const qty = round3(parseAmount(line.qty));
    const unitPrice = line.price === null ? (level?.sellingPrice ?? 0) : parseAmount(line.price);
    const plan: LinePlan = { line, level, dish, qty, unitPrice, total: 0, takes: [], expired: false, problem: null };

    if (!level) return { ...plan, problem: { kind: 'notInStock' } };
    if (!(qty > 0)) return { ...plan, problem: { kind: 'qty' } };
    if (!(unitPrice >= 0) || (line.price === null && !(unitPrice > 0))) plan.problem = { kind: 'noPrice' };

    if (dish) {
      for (const ingredient of dish.ingredients) {
        const needed = round3(ingredient.perPortion * qty);
        if (needed <= 0) continue;
        const stock = levelById.get(ingredient.productId);
        const result = stock ? allocate(stock, needed) : { available: 0 };
        if ('available' in result) {
          return {
            ...plan,
            total: round2(qty * unitPrice),
            problem: plan.problem ?? {
              kind: 'ingredientShort',
              name: stock?.name ?? '—',
              unit: stock?.unit ?? 'PCS',
              needed,
              available: result.available,
            },
          };
        }
        if (result.takes.some((row) => row.expired)) plan.expired = true;
      }
      plan.total = round2(qty * unitPrice);
      return plan;
    }

    const result = allocate(level, qty, line.batchId);
    if ('available' in result) {
      // Keep the typed total visible so the cashier sees why the line is blocked (F-28).
      return {
        ...plan,
        total: round2(qty * unitPrice),
        problem: plan.problem ?? { kind: 'short', available: result.available },
      };
    }
    plan.takes = result.takes;
    plan.expired = plan.takes.some((row) => row.expired);
    plan.total = round2(plan.takes.reduce((sum, row) => sum + round2(row.qty * unitPrice), 0));
    return plan;
  });
}

/** Barcode or product code, exact and case-insensitive. */
export function findByCode(levels: StockLevel[], code: string) {
  const needle = code.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    levels.find((level) => level.barcodes.some((barcode) => barcode.toLowerCase() === needle)) ??
    levels.find((level) => level.code.toLowerCase() === needle)
  );
}

/** RFC 4122 v4; crypto.randomUUID is missing on plain-http LAN origins. */
export function newRequestId() {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
