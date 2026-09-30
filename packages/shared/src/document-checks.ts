/**
 * Checks on a supplier document before it reaches stock, VAT and the audit file (spec §4.2, §4.7):
 * printed totals against the lines, a sane document date, and payment terms.
 */

/** How a supplier document is settled. The till records only CASH and CARD. */
export const DOCUMENT_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export type DocumentPaymentMethod = (typeof DOCUMENT_PAYMENT_METHODS)[number];

/** Amounts at one VAT rate, as shown on Bulgarian invoices (основа / ДДС / общо за ставката). */
export type VatRateTotal = { rate: number; taxableBase: number; vat: number; total: number };

export type DocumentTotals = {
  taxableBase: number;
  vat: number;
  total: number;
  /** One row per VAT rate present on the lines, sorted ascending. */
  byRate: VatRateTotal[];
};
export type PrintedTotals = { taxableBase: number | null; vat: number | null; total: number | null };
export const TOTALS_FIELDS = ['taxableBase', 'vat', 'total'] as const;
export type TotalsField = (typeof TOTALS_FIELDS)[number];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Same rounding as the VAT purchase ledger: base rounded per VAT rate, then VAT per rate. */
export function documentTotals(lines: readonly { net: number; rate: number }[]): DocumentTotals {
  const byRate = new Map<number, number>();
  for (const line of lines) byRate.set(line.rate, (byRate.get(line.rate) ?? 0) + line.net);
  const rates: VatRateTotal[] = [];
  let taxableBase = 0;
  let vat = 0;
  for (const rate of [...byRate.keys()].sort((a, b) => a - b)) {
    const base = round2(byRate.get(rate)!);
    const rateVat = rate > 0 ? round2((base * rate) / 100) : 0;
    rates.push({ rate, taxableBase: base, vat: rateVat, total: round2(base + rateVat) });
    taxableBase += base;
    vat += rateVat;
  }
  taxableBase = round2(taxableBase);
  vat = round2(vat);
  return { taxableBase, vat, total: round2(taxableBase + vat), byRate: rates };
}

/**
 * Allowed |printed − calculated| before posting is blocked (QA F-02 / F-05).
 * One named constant — not scaled by line count.
 */
export const TOTALS_TOLERANCE_EUR = 0.02;

/** @deprecated Prefer TOTALS_TOLERANCE_EUR; kept so call sites that still pass lineCount keep compiling. */
export function totalsTolerance(_lineCount?: number) {
  return TOTALS_TOLERANCE_EUR;
}

/** Tax documents are posted only against a printed grand total; other paperwork is checked when one is entered. */
export function requiresPrintedTotal(type: string) {
  return type === 'INVOICE' || type === 'CREDIT_NOTE';
}

/** Purchase invoices and credit notes need a supplier; write-offs and internal stock docs do not. */
export function requiresPartner(type: string) {
  return type === 'INVOICE' || type === 'CREDIT_NOTE';
}

export type TotalsCheck = {
  /** MISSING: no printed grand total yet. MISMATCH: a printed amount is off by more than the tolerance. */
  status: 'MATCH' | 'MISMATCH' | 'MISSING';
  required: boolean;
  tolerance: number;
  calculated: DocumentTotals;
  printed: PrintedTotals;
  /** Printed minus calculated; null where nothing is printed. */
  difference: Record<TotalsField, number | null>;
  mismatched: TotalsField[];
};

/** Credit notes are often printed with a minus sign; lines are stored positive, so compare magnitudes. */
export function reconcileTotals(input: {
  type: string;
  calculated: DocumentTotals;
  printed: PrintedTotals;
  lineCount: number;
}): TotalsCheck {
  const tolerance = totalsTolerance(input.lineCount);
  const difference = { taxableBase: null, vat: null, total: null } as Record<TotalsField, number | null>;
  const mismatched: TotalsField[] = [];
  for (const field of TOTALS_FIELDS) {
    const printed = input.printed[field];
    if (printed === null) continue;
    const delta = round2(Math.abs(printed) - input.calculated[field]);
    difference[field] = delta;
    if (Math.abs(delta) > tolerance) mismatched.push(field);
  }
  const status = mismatched.length ? 'MISMATCH' : input.printed.total === null ? 'MISSING' : 'MATCH';
  return {
    status,
    required: requiresPrintedTotal(input.type),
    tolerance,
    calculated: input.calculated,
    printed: input.printed,
    difference,
    mismatched,
  };
}

/** Older than this and the date needs a second look: a misread month or year lands here (QA F-10). */
export const DOCUMENT_DATE_MAX_AGE_DAYS = 90;
export type DocumentDateIssue = 'FUTURE' | 'OLD';

/** `today` is the business date (Europe/Sofia). A future date blocks posting; an old one needs confirmation. */
export function documentDateIssue(issuedOn: string, today: string): DocumentDateIssue | null {
  if (issuedOn > today) return 'FUTURE';
  const ageDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${issuedOn}T00:00:00Z`)) / 86_400_000);
  return ageDays > DOCUMENT_DATE_MAX_AGE_DAYS ? 'OLD' : null;
}
