import { onHandByKey, shortfallMessage, stockShortfalls } from './stock-availability';

const onHand = onHandByKey([
  { productId: 'milk', batchNumber: 'L1', direction: 'IN', quantity: 10 },
  { productId: 'milk', batchNumber: 'L1', direction: 'OUT', quantity: 4 },
  { productId: 'milk', batchNumber: 'L2', direction: 'IN', quantity: 5 },
  { productId: 'bread', batchNumber: null, direction: 'IN', quantity: 3 },
]);

if (onHand.get('milk') !== 11) throw new Error(`expected milk total 11, got ${onHand.get('milk')}`);

const milk = { productId: 'milk', productName: 'Milk', batchTracking: true };
const bread = { productId: 'bread', productName: 'Bread', batchTracking: false, batchNumber: null };

const ok = stockShortfalls(
  [
    { ...milk, batchNumber: 'L1', quantity: 6 },
    { ...bread, quantity: 3 },
  ],
  onHand,
);
if (ok.length !== 0) throw new Error(`expected no shortfalls, got ${JSON.stringify(ok)}`);

// Two lines on the same batch add up; the batch, not the product total, is the limit.
const split = stockShortfalls(
  [
    { ...milk, batchNumber: 'L1', quantity: 4 },
    { ...milk, batchNumber: ' L1 ', quantity: 3 },
  ],
  onHand,
);
if (
  split.length !== 1 ||
  !split[0]!.product.includes('batch L1') ||
  split[0]!.available !== 6 ||
  split[0]!.requested !== 7
) {
  throw new Error(`expected one L1 shortfall, got ${JSON.stringify(split)}`);
}
if (!shortfallMessage(split[0]!).includes('6 on hand, 7 to take out')) {
  throw new Error(`unexpected message ${shortfallMessage(split[0]!)}`);
}

const unknownBatch = stockShortfalls([{ ...milk, batchNumber: 'NOPE', quantity: 1 }], onHand);
if (unknownBatch.length !== 1 || unknownBatch[0]!.available !== 0) {
  throw new Error(`expected unknown batch to be short, got ${JSON.stringify(unknownBatch)}`);
}

const negative = stockShortfalls(
  [{ ...bread, quantity: 1 }],
  onHandByKey([{ productId: 'bread', batchNumber: null, direction: 'OUT', quantity: 2 }]),
);
if (negative.length !== 1 || negative[0]!.available !== 0) {
  throw new Error(`expected negative stock to read as 0 on hand, got ${JSON.stringify(negative)}`);
}

console.log('stock-availability tests passed');
