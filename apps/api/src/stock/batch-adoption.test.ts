/**
 * CAF-03: turning batch tracking on keeps the stock total, and posted lots
 * with an expiry are what the "Изтичащи скоро" board lists.
 */
import assert from 'node:assert/strict';
import { adoptLooseStock, UNBATCHED_LOT_NAME } from './batch-adoption';
import { foldBatches, foldMovements } from './stock-levels';

assert.equal(adoptLooseStock(0), null);
assert.equal(adoptLooseStock(-2), null);

const plan = adoptLooseStock(12.5);
assert.ok(plan);
assert.equal(plan.outQty, plan.inQty);
assert.equal(plan.batchNumber, UNBATCHED_LOT_NAME);
assert.equal(plan.batchNumber, 'без партида');

const when = new Date('2026-10-01');
const before = foldMovements([
  { productId: 'milk', direction: 'IN', quantity: 40, lastAt: when },
  { productId: 'milk', direction: 'OUT', quantity: 4, lastAt: when },
]);
const loose = before.get('milk')?.onHand ?? 0;
const move = adoptLooseStock(loose);
assert.ok(move);
const after = foldMovements([
  { productId: 'milk', direction: 'IN', quantity: 40, lastAt: when },
  { productId: 'milk', direction: 'OUT', quantity: 4, lastAt: when },
  { productId: 'milk', direction: 'OUT', quantity: move.outQty, lastAt: when },
  { productId: 'milk', direction: 'IN', quantity: move.inQty, lastAt: when },
]);
assert.equal(after.get('milk')?.onHand, before.get('milk')?.onHand, 'stock before equals stock after');

const batches = foldBatches([
  { productId: 'milk', batchId: 'ML-2710', direction: 'IN', quantity: 12, lastAt: when },
  { productId: 'cream', batchId: 'SM-1001', direction: 'IN', quantity: 2, lastAt: when },
  { productId: 'beans', batchId: 'AR-0926', direction: 'IN', quantity: 2, lastAt: when },
]);
assert.equal(batches.get('milk')?.get('ML-2710'), 12);
assert.equal(batches.get('cream')?.get('SM-1001'), 2);

/** Same filter as the dashboard expiry board: a batch with an expiry and stock on hand. */
const lots = [
  { name: 'Прясно мляко 3.5%', batch: 'ML-2710', expiryDate: '2026-10-10', onHand: batches.get('milk')?.get('ML-2710') ?? 0 },
  { name: 'Сметана за разбиване 35%', batch: 'SM-1001', expiryDate: '2026-10-05', onHand: batches.get('cream')?.get('SM-1001') ?? 0 },
  { name: 'Кафе на зърна Арабика', batch: 'AR-0926', expiryDate: null, onHand: 2 },
];
const board = lots.filter((lot) => lot.expiryDate && lot.onHand > 0).map((lot) => lot.batch);
assert.deepEqual(board, ['ML-2710', 'SM-1001']);

console.log('batch-adoption tests passed');
