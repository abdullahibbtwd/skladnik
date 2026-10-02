import {
  DOCUMENT_DATE_MAX_AGE_DAYS,
  PAPER_DOCUMENT_TYPES,
  documentDateIssue,
  requiresPartner,
  type TotalsCheck,
  type TotalsField,
} from '@skladnik/shared';

export type PostingProduct = {
  name: string;
  batchTracking: boolean;
  status: string;
  unit?: string;
};

export type PostingLine = {
  id: string;
  position: number;
  productId: string | null;
  product: PostingProduct | null;
  quantity: { toString(): string } | number;
  unitPrice?: { toString(): string } | number;
  freeOfCharge?: boolean;
  countedQuantity?: { toString(): string } | number | null;
  ocrBatchNumber: string | null;
  ocrExpiryDate: Date | string | null;
  /** CAF-01: printed quantity cell, stored quantity confirmation. */
  ocrUnit?: string | null;
  unit?: string | null;
  quantityConfirmed?: boolean;
  unitConfirmed?: boolean;
};

export type PostingDocument = {
  type?: string;
  direction?: string;
  siteId?: string;
  targetSiteId?: string | null;
  lines: PostingLine[];
};

function batchErrors(label: string, line: PostingLine & { product: PostingProduct }) {
  const errors: string[] = [];
  if (!line.product.batchTracking) return errors;
  if (!line.ocrBatchNumber?.trim()) errors.push(`${label}: batch number is required for ${line.product.name}`);
  if (!line.ocrExpiryDate) errors.push(`${label}: expiry date is required for ${line.product.name}`);
  return errors;
}

/**
 * Counting stock of an unreviewed product is fine (it may already hold stock from before scans stopped
 * creating products), so only paperwork lines are held back for review.
 */
function productErrors(label: string, product: PostingProduct, allowPending = false): string[] {
  if (product.status === 'ARCHIVED') return [`${label}: ${product.name} is archived`];
  if (product.status === 'PENDING_REVIEW' && !allowPending) {
    return [`${label}: ${product.name} was created automatically from a scan and hasn't been reviewed. Confirm it as a new product or choose an existing one`];
  }
  return [];
}

function stocktakeErrors(document: PostingDocument): string[] {
  const counted = document.lines.filter((line) => line.countedQuantity !== null && line.countedQuantity !== undefined);
  if (counted.length === 0) return ['Count at least one item before posting'];

  const errors: string[] = [];
  const seen = new Set<string>();
  for (const line of counted) {
    const label = `Line ${line.position + 1}`;
    if (!line.productId || !line.product) {
      errors.push(`${label}: product is required`);
      continue;
    }
    errors.push(...productErrors(label, line.product, true));
    if (Number(line.countedQuantity) < 0) errors.push(`${label}: counted quantity can't be negative`);
    errors.push(...batchErrors(label, { ...line, product: line.product }));
    const key = `${line.productId}\u0000${line.product.batchTracking ? (line.ocrBatchNumber?.trim() ?? '') : ''}`;
    if (seen.has(key)) errors.push(`${label}: ${line.product.name} is on the count sheet twice`);
    seen.add(key);
  }
  return errors;
}

export function postingErrors(document: PostingDocument): string[] {
  if (document.type === 'STOCKTAKE') return stocktakeErrors(document);

  const errors: string[] = [];
  if (document.type === 'TRANSFER') {
    if (document.direction && document.direction !== 'OUT') errors.push('A transfer must be outgoing');
    if (!document.targetSiteId) errors.push('Choose the site to transfer to');
    else if (document.targetSiteId === document.siteId) errors.push('A transfer needs two different sites');
  }
  if (document.lines.length === 0) {
    errors.push('Add at least one line before posting');
  }

  for (const line of document.lines) {
    const label = `Line ${line.position + 1}`;
    if (!line.productId || !line.product) {
      errors.push(`${label}: product is required`);
      continue;
    }
    errors.push(...productErrors(label, line.product));
    if (Number(line.quantity) <= 0) {
      errors.push(`${label}: quantity must be greater than 0`);
    }
    errors.push(...batchErrors(label, { ...line, product: line.product }));
  }

  return errors;
}

export function canDocumentBePosted(document: PostingDocument): { ok: boolean; errors: string[] } {
  const errors = postingErrors(document);
  return { ok: errors.length === 0, errors };
}

export type ExpiryCheckLine = { productName: string; batchNumber: string | null; expiryDate: string | null };
type ExpiryCheckDocument = { type: string; direction: string; issuedOn: string };

/**
 * Receiving, handing over or moving an expired batch needs an explicit confirmation.
 * Exempt: write-offs and returns to the supplier (getting rid of expired stock is their purpose),
 * and stocktakes and opening stock (recording what is already on the shelf).
 */
export function expiryGuarded(document: ExpiryCheckDocument) {
  if (['STOCKTAKE', 'OPENING_BALANCE', 'SALE', 'WRITE_OFF'].includes(document.type)) return false;
  if (document.direction === 'IN') return true;
  return document.type === 'TRANSFER' || document.type === 'PROTOCOL';
}

/** Expired: before the document date. Expiring on the document date is still fine. */
export function isExpiredOn(expiryDate: string | null, issuedOn: string) {
  return Boolean(expiryDate && expiryDate < issuedOn);
}

export function expiredBatchWarnings(document: ExpiryCheckDocument, lines: ExpiryCheckLine[]): string[] {
  if (!expiryGuarded(document)) return [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const line of lines) {
    if (!isExpiredOn(line.expiryDate, document.issuedOn)) continue;
    const key = `${line.productName}\u0000${line.batchNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const batch = `${line.productName} (batch ${line.batchNumber ?? '—'})`;
    warnings.push(
      document.direction === 'IN'
        ? `${batch} expired on ${line.expiryDate}, before the document date: it would be received already expired`
        : `${batch} expired on ${line.expiryDate}`,
    );
  }
  return warnings;
}

type HeaderCheckDocument = {
  type: string;
  issuedOn: string;
  partnerId?: string | null;
  totals: TotalsCheck | null;
};

const money = (value: number) => value.toFixed(2);

const TOTAL_LABELS: Record<TotalsField, string> = { taxableBase: 'taxable base', vat: 'VAT', total: 'grand total' };

/** Blocking problems with the header: missing supplier, a future date, or printed totals that the lines don't add up to. */
export function headerErrors(document: HeaderCheckDocument, today: string): string[] {
  const errors: string[] = [];
  if (requiresPartner(document.type) && !document.partnerId) {
    errors.push('Choose a supplier before posting');
  }
  if (document.type !== 'SALE' && documentDateIssue(document.issuedOn, today) === 'FUTURE') {
    errors.push(`The document date ${document.issuedOn} is in the future. Check it against the paper`);
  }
  const totals = document.totals;
  if (totals) {
    for (const field of totals.mismatched) {
      errors.push(
        `Printed ${TOTAL_LABELS[field]} ${money(Math.abs(totals.printed[field]!))} doesn't match the lines (${money(totals.calculated[field])}). ` +
          'Check quantities, prices and discounts against the paper',
      );
    }
    if (totals.required && totals.printed.total === null) {
      errors.push('Enter the grand total printed on the document so it can be checked against the lines');
    }
  }
  return errors;
}

/** A date well in the past is allowed (late paperwork happens) but needs confirmation. Paper documents only. */
export function dateWarning(document: { type: string; issuedOn: string }, today: string): string | null {
  if (!(PAPER_DOCUMENT_TYPES as readonly string[]).includes(document.type)) return null;
  if (documentDateIssue(document.issuedOn, today) !== 'OLD') return null;
  return `The document date ${document.issuedOn} is more than ${DOCUMENT_DATE_MAX_AGE_DAYS} days ago`;
}
