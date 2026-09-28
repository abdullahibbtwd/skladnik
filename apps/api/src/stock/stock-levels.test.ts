import { compareBatchExpiry, compareStockLevels, foldBatches, foldMovements, stockLevelStatus } from './stock-levels';

const jan = new Date('2026-01-10');
const feb = new Date('2026-02-03');

const folded = foldMovements([
  { productId: 'milk', direction: 'IN', quantity: 24, lastAt: jan },
  { productId: 'milk', direction: 'OUT', quantity: 5.5, lastAt: feb },
  { productId: 'bread', direction: 'OUT', quantity: 3, lastAt: jan },
]);

const milk = folded.get('milk');
if (milk?.onHand !== 18.5 || milk.lastMovementAt !== feb) {
  throw new Error(`expected milk 18.5 last moved in Feb, got ${JSON.stringify(milk)}`);
}
if (folded.get('bread')?.onHand !== -3) {
  throw new Error(`expected bread -3, got ${JSON.stringify(folded.get('bread'))}`);
}

const cases: [number, number, string][] = [
  [0, 0, 'OUT'],
  [-3, 10, 'OUT'],
  [4, 10, 'LOW'],
  [10, 10, 'OK'],
  [1, 0, 'OK'],
];
for (const [onHand, minStock, expected] of cases) {
  const status = stockLevelStatus(onHand, minStock);
  if (status !== expected) {
    throw new Error(`stockLevelStatus(${onHand}, ${minStock}) = ${status}, expected ${expected}`);
  }
}

const sorted = [
  { status: 'OK' as const, name: 'Apples' },
  { status: 'LOW' as const, name: 'Yoghurt' },
  { status: 'OUT' as const, name: 'Zucchini' },
  { status: 'LOW' as const, name: 'Butter' },
]
  .sort(compareStockLevels)
  .map((row) => row.name)
  .join(',');
if (sorted !== 'Zucchini,Butter,Yoghurt,Apples') {
  throw new Error(`unexpected stock order: ${sorted}`);
}

const batches = foldBatches([
  { productId: 'milk', batchId: 'L1', direction: 'IN', quantity: 10, lastAt: jan },
  { productId: 'milk', batchId: 'L1', direction: 'OUT', quantity: 4, lastAt: feb },
  { productId: 'milk', batchId: 'L2', direction: 'IN', quantity: 14, lastAt: feb },
  { productId: 'milk', batchId: null, direction: 'OUT', quantity: 1.5, lastAt: feb },
]);
const milkBatches = batches.get('milk');
if (milkBatches?.get('L1') !== 6 || milkBatches.get('L2') !== 14 || milkBatches.size !== 2) {
  throw new Error(`unexpected milk batches: ${JSON.stringify([...(milkBatches ?? [])])}`);
}

const byExpiry = [
  { batchNumber: 'none', expiryDate: null },
  { batchNumber: 'late', expiryDate: '2026-12-01' },
  { batchNumber: 'b', expiryDate: '2026-10-02' },
  { batchNumber: 'a', expiryDate: '2026-10-02' },
]
  .sort(compareBatchExpiry)
  .map((row) => row.batchNumber)
  .join(',');
if (byExpiry !== 'a,b,late,none') {
  throw new Error(`unexpected batch order: ${byExpiry}`);
}

console.log('stock-levels tests passed');
