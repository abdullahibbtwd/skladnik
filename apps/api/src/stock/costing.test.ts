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

// Reversing a receipt takes it back out of the average and the batch cost, as if it never came in.
{
  const book = new CostBook([], new Map(), new Map());
  book.receive('z', 'b1', 10, 2);
  book.receive('z', 'b1', 10, 4);
  expectEqual(book.unitCost('z', 'b1'), 3, 'batch blends both receipts');
  expectEqual(book.average('z'), 3, 'average blends both receipts');
  book.unreceive('z', 'b1', 10, 4);
  expectEqual(book.onHand('z', 'b1'), 10, 'reversed quantity leaves the batch');
  expectEqual(book.unitCost('z', 'b1'), 2, 'batch cost back to the first receipt');
  expectEqual(book.average('z'), 2, 'average back to the first receipt');
  book.unreceive('z', 'b1', 10, 2);
  expectEqual(book.onHand('z'), 0, 'nothing left');
  expectEqual(book.average('z'), 2, 'average kept when nothing is left');
}

// Part of the stock already went out at the blended average: the average never goes negative.
{
  const book = new CostBook([], new Map(), new Map());
  book.receive('w', null, 10, 1);
  book.receive('w', null, 10, 9);
  book.issue('w', null, 9);
  book.unreceive('w', null, 10, 9);
  expectEqual(book.onHand('w'), 1, 'one left');
  expectEqual(book.average('w'), 5, 'average kept instead of (11 × 5 − 90) / 1');
}

// Undoing an issue puts the stock back without changing what the batch cost.
{
  const book = new CostBook([{ productId: 'v', batchId: 'b1', onHand: 10, inQty: 10, inValue: 30 }], new Map([['v', 3]]), new Map());
  const cost = book.issue('v', 'b1', 4);
  book.restore('v', 'b1', 4, cost);
  expectEqual(book.onHand('v', 'b1'), 10, 'batch back to 10');
  expectEqual(book.unitCost('v', 'b1'), 3, 'batch cost unchanged');
  expectEqual(book.average('v'), 3, 'average unchanged');
}

// No history at all: catalog purchase price.
{
  const book = new CostBook([], new Map(), new Map([['q', 4.2]]));
  expectEqual(book.unitCost('q', null), 4.2, 'fallback to purchase price');
}

console.log('costing tests passed');
