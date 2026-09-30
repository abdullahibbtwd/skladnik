/**
 * Lightweight stand-in for deleteOrphanAutoProducts: the real function talks to Prisma;
 * this test pins the "detach then delete unused PENDING_REVIEW" contract for cancel/re-scan.
 */
import assert from 'node:assert/strict';

type FakeProduct = {
  id: string;
  status: string;
  createdFromDocumentId: string | null;
  usedByLines: string[];
  usedByOther: boolean;
};

function orphansToDelete(
  products: FakeProduct[],
  documentId: string,
  options: { detach?: boolean } = {},
): string[] {
  const pending = products.filter(
    (product) => product.createdFromDocumentId === documentId && product.status === 'PENDING_REVIEW',
  );
  const remaining = products.map((product) => ({ ...product, usedByLines: [...product.usedByLines] }));
  if (options.detach) {
    for (const product of remaining) {
      if (!pending.some((row) => row.id === product.id)) continue;
      product.usedByLines = product.usedByLines.filter((lineDocId) => lineDocId !== documentId);
    }
  }
  return pending
    .filter((product) => {
      const live = remaining.find((row) => row.id === product.id)!;
      return live.usedByLines.length === 0 && !live.usedByOther;
    })
    .map((product) => product.id);
}

const catalog: FakeProduct[] = [
  { id: 'auto-1', status: 'PENDING_REVIEW', createdFromDocumentId: 'doc-a', usedByLines: ['doc-a'], usedByOther: false },
  { id: 'auto-2', status: 'PENDING_REVIEW', createdFromDocumentId: 'doc-a', usedByLines: ['doc-a', 'doc-b'], usedByOther: false },
  { id: 'auto-3', status: 'PENDING_REVIEW', createdFromDocumentId: 'doc-a', usedByLines: ['doc-a'], usedByOther: true },
  { id: 'kept', status: 'ACTIVE', createdFromDocumentId: 'doc-a', usedByLines: ['doc-a'], usedByOther: false },
];

assert.deepEqual(orphansToDelete(catalog, 'doc-a'), [], 'without detach, lines still reference them');
assert.deepEqual(orphansToDelete(catalog, 'doc-a', { detach: true }), ['auto-1'], 'cancel removes only unused auto products');
assert.deepEqual(orphansToDelete(catalog, 'doc-x', { detach: true }), [], 'other documents are left alone');

console.log('auto-products tests passed');
