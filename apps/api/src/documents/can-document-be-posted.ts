export type PostingProduct = {
  name: string;
  batchTracking: boolean;
  status: string;
};

export type PostingLine = {
  id: string;
  position: number;
  productId: string | null;
  product: PostingProduct | null;
  quantity: { toString(): string } | number;
  countedQuantity?: { toString(): string } | number | null;
  ocrBatchNumber: string | null;
  ocrExpiryDate: Date | string | null;
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
    if (line.product.status === 'ARCHIVED') errors.push(`${label}: ${line.product.name} is archived`);
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
    if (line.product.status === 'ARCHIVED') {
      errors.push(`${label}: ${line.product.name} is archived`);
    }
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
type ExpiryCheckDocument = { type: string; direction: string; writeOffReason: string | null; issuedOn: string };

/**
 * Handing over or moving an expired batch needs an explicit confirmation.
 * Write-offs are exempt: getting rid of expired stock is their purpose.
 */
export function expiryGuarded(document: ExpiryCheckDocument) {
  return document.type === 'TRANSFER' || (document.type === 'PROTOCOL' && document.direction === 'OUT' && !document.writeOffReason);
}

/** Expiring on the document date is still fine; the day after is not. */
export function expiredBatchWarnings(document: ExpiryCheckDocument, lines: ExpiryCheckLine[]): string[] {
  if (!expiryGuarded(document)) return [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const line of lines) {
    if (!line.expiryDate || line.expiryDate >= document.issuedOn) continue;
    const key = `${line.productName}\u0000${line.batchNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push(`${line.productName} (batch ${line.batchNumber ?? '—'}) expired on ${line.expiryDate}`);
  }
  return warnings;
}
