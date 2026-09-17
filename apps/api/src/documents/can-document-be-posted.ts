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
  ocrBatchNumber: string | null;
  ocrExpiryDate: Date | string | null;
};

export type PostingDocument = {
  lines: PostingLine[];
};

export function postingErrors(document: PostingDocument): string[] {
  const errors: string[] = [];
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
    if (line.product.batchTracking) {
      if (!line.ocrBatchNumber?.trim()) {
        errors.push(`${label}: batch number is required for ${line.product.name}`);
      }
      if (!line.ocrExpiryDate) {
        errors.push(`${label}: expiry date is required for ${line.product.name}`);
      }
    }
  }

  return errors;
}

export function canDocumentBePosted(document: PostingDocument): { ok: boolean; errors: string[] } {
  const errors = postingErrors(document);
  return { ok: errors.length === 0, errors };
}
