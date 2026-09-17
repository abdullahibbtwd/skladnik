import { canDocumentBePosted } from './can-document-be-posted';

function line(overrides: Partial<Parameters<typeof canDocumentBePosted>[0]['lines'][number]> = {}) {
  return {
    id: 'line-1',
    position: 0,
    productId: 'p1',
    product: { name: 'Milk', batchTracking: true, status: 'ACTIVE' },
    quantity: 10,
    ocrBatchNumber: 'LOT-1',
    ocrExpiryDate: '2026-12-01',
    ...overrides,
  };
}

const empty = canDocumentBePosted({ lines: [] });
if (empty.ok || !empty.errors[0]?.includes('at least one line')) {
  throw new Error(`expected empty-doc error, got ${JSON.stringify(empty)}`);
}

const missingBatch = canDocumentBePosted({
  lines: [line({ ocrBatchNumber: null, ocrExpiryDate: null })],
});
if (missingBatch.ok || missingBatch.errors.length < 2) {
  throw new Error(`expected batch+expiry errors, got ${JSON.stringify(missingBatch)}`);
}

const noProduct = canDocumentBePosted({
  lines: [line({ productId: null, product: null })],
});
if (noProduct.ok || !noProduct.errors[0]?.includes('product is required')) {
  throw new Error(`expected product error, got ${JSON.stringify(noProduct)}`);
}

const ok = canDocumentBePosted({
  lines: [
    line(),
    line({
      id: 'line-2',
      position: 1,
      product: { name: 'Flour', batchTracking: false, status: 'ACTIVE' },
      ocrBatchNumber: null,
      ocrExpiryDate: null,
    }),
  ],
});
if (!ok.ok) {
  throw new Error(`expected valid document, got ${JSON.stringify(ok)}`);
}

console.log('canDocumentBePosted unit checks passed.');
