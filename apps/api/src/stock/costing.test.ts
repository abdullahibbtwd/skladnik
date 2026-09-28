import { CostBook } from './costing';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Moving average: 10 @ 2.00, then 10 @ 3.00 → 2.50; issuing doesn't change it; the next receipt re-weights.
{
  const book = new CostBook([], new Map(), new Map([['milk', 9]]));
  book.receive('milk', null, 10, 2);
  expectEqual(book.average('milk'), 2, 'first receipt sets the average');
  book.receive('milk', null, 10, 3);
  expectEqual(book.average('milk'), 2.5, 'second receipt re-weights');
  expectEqual(book.issue('milk', null, 15), 2.5, 'issue at average');
  expectEqual(book.onHand('milk'), 5, 'on hand after issue');
  book.receive('milk', null, 5, 3.5);
  expectEqual(book.average('milk'), 3, '5 @ 2.50 + 5 @ 3.50');
  expectEqual(book.value('milk'), 30, 'value at average');
  expectEqual(JSON.stringify(book.changedAverages()), JSON.stringify([['milk', 3]]), 'changed averages');
}

// Receiving into zero or negative stock resets the average to the new cost.
{
  const book = new CostBook([{ productId: 'p', batchId: null, onHand: -2, inQty: 0, inValue: 0 }], new Map([['p', 10]]), new Map());
  book.receive('p', null, 4, 1);
  expectEqual(book.average('p'), 1, 'negative stock resets');
}

// Batches keep their own cost; the product average still moves with every receipt.
{
  const book = new CostBook(
    [
      { productId: 'y', batchId: 'b1', onHand: 10, inQty: 10, inValue: 10 },
      { productId: 'y', batchId: 'b2', onHand: 10, inQty: 10, inValue: 20 },
    ],
    new Map([['y', 1.5]]),
    new Map(),
  );
  expectEqual(book.unitCost('y', 'b1'), 1, 'batch 1 cost');
  expectEqual(book.unitCost('y', 'b2'), 2, 'batch 2 cost');
  expectEqual(book.issue('y', 'b2', 4), 2, 'issue from batch at its own cost');
  expectEqual(book.onHand('y', 'b2'), 6, 'batch on hand');
  expectEqual(book.onHand('y'), 16, 'product on hand');
  expectEqual(book.value('y'), 22, '10 × 1 + 6 × 2');
  expectEqual(book.unitCost('y', 'new-batch'), 1.5, 'unknown batch falls back to the average');
}

// No history at all: catalog purchase price.
{
  const book = new CostBook([], new Map(), new Map([['q', 4.2]]));
  expectEqual(book.unitCost('q', null), 4.2, 'fallback to purchase price');
}

console.log('costing tests passed');
