import { canDocumentBePosted, expiredBatchWarnings } from './can-document-be-posted';

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

// Audit F-03: a line on a product a scan made up showed "ready to post".
const pendingProduct = canDocumentBePosted({
  lines: [line({ product: { name: 'OCR guess', batchTracking: false, status: 'PENDING_REVIEW' } })],
});
if (pendingProduct.ok || !pendingProduct.errors[0]?.includes("hasn't been reviewed")) {
  throw new Error(`expected unreviewed-product error, got ${JSON.stringify(pendingProduct)}`);
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

const sameSite = canDocumentBePosted({ type: 'TRANSFER', siteId: 's1', targetSiteId: 's1', lines: [line()] });
if (sameSite.ok || !sameSite.errors[0]?.includes('two different sites')) {
  throw new Error(`expected same-site transfer error, got ${JSON.stringify(sameSite)}`);
}
const noTarget = canDocumentBePosted({ type: 'TRANSFER', siteId: 's1', targetSiteId: null, lines: [line()] });
if (noTarget.ok || !noTarget.errors[0]?.includes('site to transfer to')) {
  throw new Error(`expected missing target error, got ${JSON.stringify(noTarget)}`);
}
const incoming = canDocumentBePosted({ type: 'TRANSFER', direction: 'IN', siteId: 's1', targetSiteId: 's2', lines: [line()] });
if (incoming.ok || !incoming.errors[0]?.includes('must be outgoing')) {
  throw new Error(`expected outgoing-only transfer error, got ${JSON.stringify(incoming)}`);
}

const uncounted = canDocumentBePosted({ type: 'STOCKTAKE', lines: [line({ quantity: 0, countedQuantity: null })] });
if (uncounted.ok || !uncounted.errors[0]?.includes('Count at least one')) {
  throw new Error(`expected uncounted stocktake error, got ${JSON.stringify(uncounted)}`);
}
const countedZero = canDocumentBePosted({
  type: 'STOCKTAKE',
  lines: [line({ quantity: 0, countedQuantity: 0 }), line({ id: 'line-2', position: 1, quantity: 0, countedQuantity: null, productId: null, product: null })],
});
if (!countedZero.ok) {
  throw new Error(`a zero count is valid and uncounted lines are ignored, got ${JSON.stringify(countedZero)}`);
}
const twice = canDocumentBePosted({
  type: 'STOCKTAKE',
  lines: [line({ countedQuantity: 1 }), line({ id: 'line-2', position: 1, countedQuantity: 2 })],
});
if (twice.ok || !twice.errors[0]?.includes('twice')) {
  throw new Error(`expected duplicate count error, got ${JSON.stringify(twice)}`);
}

const header = { type: 'TRANSFER', direction: 'OUT', issuedOn: '2026-09-28' };
const expired = expiredBatchWarnings(header, [
  { productName: 'Milk', batchNumber: 'L1', expiryDate: '2026-09-27' },
  { productName: 'Milk', batchNumber: 'L2', expiryDate: '2026-09-28' },
]);
if (expired.length !== 1 || !expired[0].includes('L1')) {
  throw new Error(`expected one expired warning (expiring today is still fine), got ${JSON.stringify(expired)}`);
}
const writeOff = expiredBatchWarnings({ ...header, type: 'WRITE_OFF' }, [
  { productName: 'Milk', batchNumber: 'L1', expiryDate: '2026-01-01' },
]);
if (writeOff.length !== 0) throw new Error('write-offs never need the expiry confirmation');

const received = expiredBatchWarnings({ type: 'RECEIPT', direction: 'IN', issuedOn: '2026-09-30' }, [
  { productName: 'Кренвирши', batchNumber: 'QA-EXP-01', expiryDate: '2026-09-01' },
]);
if (received.length !== 1 || !received[0].includes('received already expired')) {
  throw new Error(`receiving an expired batch needs confirmation, got ${JSON.stringify(received)}`);
}
const opening = expiredBatchWarnings({ type: 'OPENING_BALANCE', direction: 'IN', issuedOn: '2026-09-30' }, [
  { productName: 'Milk', batchNumber: 'L1', expiryDate: '2026-09-01' },
]);
if (opening.length !== 0) throw new Error('opening stock records what is on the shelf, expired or not');
const supplierReturn = expiredBatchWarnings({ type: 'CREDIT_NOTE', direction: 'OUT', issuedOn: '2026-09-30' }, [
  { productName: 'Milk', batchNumber: 'L1', expiryDate: '2026-09-01' },
]);
if (supplierReturn.length !== 0) throw new Error('returning expired stock to the supplier needs no confirmation');

console.log('canDocumentBePosted unit checks passed.');
