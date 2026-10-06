/** Platform SaaS invoice statuses (aligned with Prisma InvoiceStatus). */
export const INVOICE_STATUSES = ['ISSUED', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Allowed invoice status transitions.
 * Created as ISSUED (no DRAFT). PAID → VOID is not allowed.
 */
export const INVOICE_STATUS_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  ISSUED: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
};

export function canTransitionInvoiceStatus(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return false;
  return INVOICE_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * VAT rounding rule (document + enforce in app before insert):
 * 1. `subtotalMinor` is the sum of line `lineMinor` integers (already in minor units).
 * 2. `vatMinor = roundHalfUp(subtotalMinor * vatRatePercent / 100)`.
 * 3. `totalMinor = subtotalMinor + vatMinor` (DB CHECK enforces equality).
 *
 * `roundHalfUp`: fractional part ≥ 0.5 rounds away from zero for positive amounts
 * (standard commercial half-up on the minor-unit result).
 */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export function computeVatMinor(subtotalMinor: number, vatRatePercent: number): number {
  if (!Number.isFinite(subtotalMinor) || !Number.isFinite(vatRatePercent)) {
    throw new RangeError('subtotalMinor and vatRatePercent must be finite');
  }
  if (subtotalMinor < 0 || vatRatePercent < 0) {
    throw new RangeError('subtotalMinor and vatRatePercent must be >= 0');
  }
  return roundHalfUp((subtotalMinor * vatRatePercent) / 100);
}

export function computeInvoiceTotals(
  subtotalMinor: number,
  vatRatePercent: number,
): { subtotalMinor: number; vatMinor: number; totalMinor: number } {
  const vatMinor = computeVatMinor(subtotalMinor, vatRatePercent);
  return {
    subtotalMinor,
    vatMinor,
    totalMinor: subtotalMinor + vatMinor,
  };
}
