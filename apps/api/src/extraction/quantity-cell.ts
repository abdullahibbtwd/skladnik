/**
 * CAF-01: the quantity column is often read as one string ("12 л", "1,5 кг", "24 бр.").
 * The number is taken ONLY from that cell. A pack size inside the product name
 * ("Мляко прясно 3,5% 1 л") is never the quantity.
 *
 * Compatible units convert with fixed factors (л ↔ мл, кг ↔ г). Anything else
 * (кашон vs бр, or no conversion) is kept as printed and flagged for the reviewer.
 */
import type { UnitOfMeasure } from '@skladnik/shared';

/** Stock units plus the two recipe units that appear in a quantity cell. */
export type QuantityMeasure = UnitOfMeasure | 'G' | 'ML';

export type ParsedQuantityCell = {
  quantity: number;
  /** Unit token as printed, without the number. */
  unitRaw: string;
  measure: QuantityMeasure | null;
};

export type ResolvedScanQuantity = {
  quantity: number;
  /** Null when the cell gave no opinion and the caller should keep its own default. */
  unit: UnitOfMeasure | null;
  /** Printed number and the quantity we would store disagree. */
  quantityCheck: boolean;
  /** Parsed unit cannot be converted onto the product unit. */
  unitCheck: boolean;
};

const STOCK_UNITS = new Set<string>(['PCS', 'PACK', 'KG', 'L', 'CASE', 'CARTON', 'JAR', 'OTHER']);

/** Case-insensitive, trailing dots ignored ("бр." = "бр", "опак." = "опак"). */
const UNIT_ALIASES: Record<string, QuantityMeasure> = {
  л: 'L',
  литър: 'L',
  литра: 'L',
  l: 'L',
  мл: 'ML',
  ml: 'ML',
  кг: 'KG',
  kg: 'KG',
  г: 'G',
  гр: 'G',
  g: 'G',
  бр: 'PCS',
  брой: 'PCS',
  pcs: 'PCS',
  оп: 'PACK',
  опак: 'PACK',
  опаковка: 'PACK',
  кашон: 'CARTON',
  каса: 'CASE',
  // Already recognised on Mini Market invoices; kept so "24 бр." is not the only safe cell.
  стек: 'CASE',
  буркан: 'JAR',
  пак: 'PACK',
  пакет: 'PACK',
  pack: 'PACK',
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

function normUnit(raw: string) {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/\.+$/u, '').replace(/\s+/g, ' ');
}

export function measureOfUnitText(raw: string | null | undefined): QuantityMeasure | null {
  if (!raw?.trim()) return null;
  return UNIT_ALIASES[normUnit(raw)] ?? null;
}

function asStockUnit(measure: QuantityMeasure | null): UnitOfMeasure | null {
  if (!measure || measure === 'G' || measure === 'ML') return null;
  if (measure === 'OTHER') return 'OTHER';
  return STOCK_UNITS.has(measure) ? measure : null;
}

/**
 * Convert only between litres and millilitres, or kilograms and grams.
 * Returns null when the units are not that pair (including кашон → бр).
 */
export function convertToStockUnit(quantity: number, from: QuantityMeasure, to: UnitOfMeasure): number | null {
  if (!Number.isFinite(quantity)) return null;
  if (from === to) return round3(quantity);
  if (from === 'ML' && to === 'L') return round3(quantity / 1000);
  if (from === 'G' && to === 'KG') return round3(quantity / 1000);
  return null;
}

/**
 * Split a quantity cell into a number and a unit. Returns null when the cell
 * has no number ("бр.", empty) — the model's qty is then the quantity.
 * Never call this with a product name.
 */
export function parseQuantityCell(raw: string | null | undefined): ParsedQuantityCell | null {
  if (!raw?.trim()) return null;
  const text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/u);
  if (!match) return null;
  const quantity = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unitRaw = match[2].trim();
  return {
    quantity,
    unitRaw,
    measure: unitRaw ? measureOfUnitText(unitRaw) : null,
  };
}

function productTarget(unit: string | null | undefined): UnitOfMeasure | null {
  if (!unit || unit === 'OTHER') return null;
  return STOCK_UNITS.has(unit) ? (unit as UnitOfMeasure) : null;
}

/**
 * Quantity and unit to store for a scanned line.
 * `modelQty` is used only when the cell itself has no number.
 * `keepQuantity` is the reviewer's number — it is not replaced by 1 or by the product default.
 */
export function resolveScannedQuantity(input: {
  printed: string | null | undefined;
  modelQty: number;
  productUnit?: string | null;
  keepQuantity?: number | null;
}): ResolvedScanQuantity {
  const parsed = parseQuantityCell(input.printed);
  const target = productTarget(input.productUnit);
  const measure = parsed?.measure ?? (!parsed ? measureOfUnitText(input.printed) : null);
  const fromCell = parsed ? parsed.quantity : input.modelQty > 0 ? input.modelQty : 0;
  const kept = input.keepQuantity != null && input.keepQuantity > 0 ? input.keepQuantity : null;

  let quantity = kept ?? fromCell;
  let unit: UnitOfMeasure | null = null;
  let unitCheck = false;

  if (measure && target) {
    const converted = convertToStockUnit(kept ?? fromCell, measure, target);
    if (converted == null) {
      unit = asStockUnit(measure) ?? 'OTHER';
      unitCheck = true;
      if (kept == null) quantity = fromCell;
    } else {
      unit = target;
      if (kept == null) quantity = converted;
    }
  } else if (measure) {
    unit = asStockUnit(measure);
    if (!unit) {
      // мл / г with no product in litres or kilograms — do not guess a stock unit.
      unit = 'OTHER';
      unitCheck = true;
    }
  } else if (parsed?.unitRaw) {
    unit = 'OTHER';
    unitCheck = Boolean(target);
  } else if (target && kept == null) {
    unit = target;
  }

  const expected = parsed
    ? measure && target
      ? convertToStockUnit(parsed.quantity, measure, target)
      : parsed.quantity
    : null;
  const quantityCheck =
    expected == null ? Boolean(input.printed && /\d/u.test(input.printed) && !parsed) : Math.abs(expected - quantity) > 0.0005;

  return { quantity: round3(quantity), unit, quantityCheck, unitCheck };
}

/** Flags for a line already stored. Confirmation clears the matching flag. */
export function scanLineChecks(input: {
  printed: string | null | undefined;
  quantity: number;
  productUnit?: string | null;
  quantityConfirmed?: boolean;
  unitConfirmed?: boolean;
}): { quantityCheck: boolean; unitCheck: boolean } {
  if (input.printed == null || input.printed === '') {
    return { quantityCheck: false, unitCheck: false };
  }
  const resolved = resolveScannedQuantity({
    printed: input.printed,
    modelQty: input.quantity,
    productUnit: input.productUnit,
    keepQuantity: input.quantity,
  });
  return {
    quantityCheck: !input.quantityConfirmed && resolved.quantityCheck,
    unitCheck: !input.unitConfirmed && resolved.unitCheck,
  };
}
