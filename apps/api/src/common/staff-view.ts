import { canSeeFinancials, type UserRole } from '@skladnik/shared';

/**
 * Central role-based response filtering (CASHIER F-04 / F-05 / F-06).
 * Services present full payloads for managers and pass Staff responses through
 * these helpers so cost / profit / stock-value / supplier-contact never leak.
 *
 * Product decision (recommended default): Staff also never sees document unit
 * prices or monetary totals — they record qty/batch/expiry/photo; managers check prices.
 */

/** Field names a Staff token must never receive in any JSON body (test scanner + strip). */
export const STAFF_FORBIDDEN_FIELD_NAMES = [
  'purchasePrice',
  'avgCost',
  'unitCost',
  'cost',
  'profit',
  'margin',
  'marginPercent',
  'stockValue',
  'varianceValue',
  'shortageValue',
  'surplusValue',
  'netValue',
  'linesWithoutCost',
  'showsCost',
  'bankAccount',
  'mol',
  'phone',
  'email',
  'address',
  'eik',
  'vatNumber',
  'taxId',
] as const;

/** Document / reorder money fields Staff must not see (selling-price on sales is exempt). */
export const STAFF_FORBIDDEN_MONEY_FIELDS = [
  'unitPrice',
  'finalUnitPrice',
  'lineTotal',
  'printedLineTotal',
  'printedTotal',
  'printedTaxableBase',
  'printedVatAmount',
  'total',
  'totals',
  'value',
] as const;

const COST_KEYS = new Set<string>(STAFF_FORBIDDEN_FIELD_NAMES);
const MONEY_KEYS = new Set<string>(STAFF_FORBIDDEN_MONEY_FIELDS);

export function seesFinancials(role: UserRole): boolean {
  return canSeeFinancials(role);
}

/** Drop keys in-place for Staff; managers get the object unchanged. */
export function omitForStaff<T extends Record<string, unknown>>(
  role: UserRole,
  row: T,
  keys: readonly string[],
): T {
  if (seesFinancials(role)) return row;
  const out = { ...row };
  for (const key of keys) delete out[key];
  return out;
}

/** Recursively strip forbidden cost/contact keys. Does not strip selling `unitPrice` on sales. */
export function stripStaffFinancialTree(role: UserRole, value: unknown, opts: { stripMoney?: boolean } = {}): unknown {
  if (seesFinancials(role)) return value;
  return stripTree(value, opts.stripMoney ?? false);
}

function stripTree(value: unknown, stripMoney: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => stripTree(item, stripMoney));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (COST_KEYS.has(key)) continue;
    if (stripMoney && MONEY_KEYS.has(key)) continue;
    out[key] = stripTree(child, stripMoney);
  }
  return out;
}

/** Product catalog row for the caller's role. Keeps sellingPrice for POS. */
export function presentProductForRole<T extends Record<string, unknown>>(role: UserRole, product: T): T {
  return omitForStaff(role, product, ['purchasePrice']);
}

/** Stock level / batch row: drop cost and book value. */
export function presentStockItemForRole<T extends Record<string, unknown>>(role: UserRole, item: T): T {
  const stripped = omitForStaff(role, item, ['purchasePrice', 'avgCost', 'value']);
  if (seesFinancials(role)) return stripped;
  const batches = Array.isArray(stripped.batches)
    ? (stripped.batches as Record<string, unknown>[]).map((batch) => omitForStaff(role, batch, ['unitCost', 'value']))
    : stripped.batches;
  return { ...stripped, batches } as T;
}

/** Stock movements: hide unitCost / value. */
export function presentMovementForRole<T extends Record<string, unknown>>(role: UserRole, movement: T): T {
  return omitForStaff(role, movement, ['unitCost', 'value']);
}

/**
 * Reorder suggestion (recommended default): product + suggested qty only —
 * no prices, totals, or supplier contact fields.
 */
export function presentReorderForRole(role: UserRole, payload: { siteId: string; suppliers: unknown[] }) {
  if (seesFinancials(role)) return payload;
  return {
    siteId: payload.siteId,
    suppliers: (payload.suppliers as Record<string, unknown>[]).map((group) => {
      const partner = group.partner as Record<string, unknown> | null;
      const lines = (group.lines as Record<string, unknown>[]).map((line) =>
        omitForStaff(role, line, ['unitPrice', 'lineTotal', 'purchasePrice']),
      );
      return {
        partner: partner ? { id: partner.id, name: partner.name } : null,
        lines,
      };
    }),
  };
}

/** Document line money + stocktake value (recommended default for Staff drafts too). */
export function presentDocumentLineForRole<T extends Record<string, unknown>>(role: UserRole, line: T): T {
  if (seesFinancials(role)) return line;
  const stripped = omitForStaff(role, line, [
    'unitPrice',
    'finalUnitPrice',
    'lineTotal',
    'printedLineTotal',
    'discountPercent',
  ]) as Record<string, unknown>;
  if (stripped.stocktake && typeof stripped.stocktake === 'object') {
    stripped.stocktake = omitForStaff(role, stripped.stocktake as Record<string, unknown>, [
      'unitCost',
      'varianceValue',
    ]);
  }
  return stripped as T;
}

export function presentDocumentDetailForRole<T extends Record<string, unknown>>(role: UserRole, detail: T): T {
  if (seesFinancials(role)) return detail;
  const document = detail.document as Record<string, unknown> | undefined;
  if (!document) return stripStaffFinancialTree(role, detail, { stripMoney: true }) as T;
  const partner = document.partner as Record<string, unknown> | null | undefined;
  const lines = Array.isArray(document.lines)
    ? (document.lines as Record<string, unknown>[]).map((line) => presentDocumentLineForRole(role, line))
    : document.lines;
  const stocktake =
    document.stocktake && typeof document.stocktake === 'object'
      ? omitForStaff(role, document.stocktake as Record<string, unknown>, [
          'shortageValue',
          'surplusValue',
          'netValue',
          'unitCost',
        ])
      : document.stocktake;
  return {
    ...detail,
    document: {
      ...omitForStaff(role, document, ['totals', 'printedTotal', 'printedTaxableBase', 'printedVatAmount']),
      partner: partner
        ? { id: partner.id, name: partner.name, ...(partner.kind !== undefined ? { kind: partner.kind } : {}) }
        : partner,
      lines,
      stocktake,
    },
  } as T;
}

/** Collect every key that appears in a JSON tree (for the Staff field-filter test). */
export function collectJsonKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonKeys(item, into);
    return into;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      into.add(key);
      collectJsonKeys(child, into);
    }
  }
  return into;
}
