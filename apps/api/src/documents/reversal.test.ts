import { CostBook } from '../stock/costing';
import { planReversal, type OriginalMovement } from './reversal';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const describe = (movement: OriginalMovement) => `${movement.productId}/${movement.batchId ?? '—'}`;
const move = (row: Partial<OriginalMovement> & Pick<OriginalMovement, 'id' | 'direction' | 'quantity'>): OriginalMovement => ({
  siteId: 'A',
  documentLineId: `line-${row.id}`,
  productId: 'milk',
  batchId: 'b1',
  unitCost: 2,
  ...row,
});

// Reversing a purchase: an OUT per IN, same batch and cost, and the batch cost goes back to before it.
{
  const book = new CostBook(
    [{ productId: 'milk', batchId: 'b1', onHand: 20, inQty: 20, inValue: 60 }],
    new Map([['milk', 3]]),
    new Map(),
  );
  const plan = planReversal([move({ id: 'm1', direction: 'IN', quantity: 10, unitCost: 4 })], new Map([['A', book]]), describe);
  expectEqual(plan.shortfalls, [], 'enough stock');
  expectEqual(
    plan.movements,
    [{ reversalOfId: 'm1', siteId: 'A', documentLineId: 'line-m1', productId: 'milk', batchId: 'b1', direction: 'OUT', quantity: 10, unitCost: 4 }],
    'mirrored movement',
  );
  expectEqual(book.onHand('milk', 'b1'), 10, 'batch on hand after reversal');
  expectEqual(book.unitCost('milk', 'b1'), 2, 'batch cost without the reversed receipt');
  expectEqual(book.average('milk'), 2, 'average without the reversed receipt');
}

// Stock already sold: the reversal is refused with what is left.
{
  const book = new CostBook([{ productId: 'milk', batchId: 'b1', onHand: 4, inQty: 10, inValue: 20 }], new Map([['milk', 2]]), new Map());
  const plan = planReversal([move({ id: 'm1', direction: 'IN', quantity: 10 })], new Map([['A', book]]), describe);
  expectEqual(plan.shortfalls, ['milk/b1: 10 came in on this document but only 4 is left, the rest was sold or moved since'], 'shortfall');
}

// A transfer: IN back at the sender, OUT at the receiver, each at the cost the goods moved at.
{
  const sender = new CostBook([], new Map([['milk', 2]]), new Map());
  const receiver = new CostBook([{ productId: 'milk', batchId: 'b1', onHand: 5, inQty: 5, inValue: 10 }], new Map([['milk', 2]]), new Map());
  const plan = planReversal(
    [
      move({ id: 'out', direction: 'OUT', quantity: 5, siteId: 'A' }),
      move({ id: 'in', direction: 'IN', quantity: 5, siteId: 'B' }),
    ],
    new Map([['A', sender], ['B', receiver]]),
    describe,
  );
  expectEqual(plan.shortfalls, [], 'receiver still holds it');
  expectEqual(plan.movements.map((row) => `${row.siteId}:${row.direction}:${row.reversalOfId}`), ['A:IN:out', 'B:OUT:in'], 'both sites');
  expectEqual(sender.onHand('milk', 'b1'), 5, 'back at the sender');
  expectEqual(receiver.onHand('milk', 'b1'), 0, 'gone from the receiver');
}

// Stocktake with a shortage and a surplus of the same product: stock goes back first, so neither blocks the other.
{
  const book = new CostBook([{ productId: 'milk', batchId: null, onHand: 3, inQty: 0, inValue: 0 }], new Map([['milk', 2]]), new Map());
  const plan = planReversal(
    [
      move({ id: 'surplus', direction: 'IN', quantity: 5, batchId: null }),
      move({ id: 'shortage', direction: 'OUT', quantity: 4, batchId: null }),
    ],
    new Map([['A', book]]),
    describe,
  );
  expectEqual(plan.shortfalls, [], '3 + 4 back, then 5 out');
  expectEqual(book.onHand('milk'), 2, 'net on hand');
}

// A legacy movement without a cost reverses at the current cost.
{
  const book = new CostBook([{ productId: 'milk', batchId: null, onHand: 0, inQty: 0, inValue: 0 }], new Map([['milk', 2.5]]), new Map());
  const plan = planReversal([move({ id: 'old', direction: 'OUT', quantity: 1, batchId: null, unitCost: null })], new Map([['A', book]]), describe);
  expectEqual(plan.movements[0].unitCost, 2.5, 'falls back to the average');
}

console.log('reversal tests passed');
