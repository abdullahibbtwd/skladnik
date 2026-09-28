import { allocateSaleLine, type SellableBatch } from './fefo';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const today = '2026-09-28';
const batches: SellableBatch[] = [
  { batchId: 'late', batchNumber: 'L3', expiryDate: '2026-12-01', onHand: 10 },
  { batchId: 'soon', batchNumber: 'L2', expiryDate: '2026-10-01', onHand: 3 },
  { batchId: 'old', batchNumber: 'L1', expiryDate: '2026-09-01', onHand: 5 },
  { batchId: 'empty', batchNumber: 'L0', expiryDate: '2026-09-30', onHand: 0 },
];
const line = { productName: 'Yoghurt', batchTracking: true, onHand: 18, batches };

// FEFO skips expired and empty batches and takes the earliest expiry first.
expectEqual(
  allocateSaleLine({ ...line, quantity: 5 }, today),
  {
    allocations: [
      { batchId: 'soon', quantity: 3, expired: false },
      { batchId: 'late', quantity: 2, expired: false },
    ],
    shortfall: null,
    expired: [],
  },
  'FEFO across batches',
);

// Expired stock is only reached when fresh stock runs out, and is reported.
{
  const result = allocateSaleLine({ ...line, quantity: 15 }, today);
  expectEqual(result.allocations.map((row) => [row.batchId, row.quantity, row.expired]), [
    ['soon', 3, false],
    ['late', 10, false],
    ['old', 2, true],
  ], 'expired last');
  expectEqual(result.expired, ['Yoghurt (batch L1) expired on 2026-09-01'], 'expired warning');
}

// Expiring today is still fine.
expectEqual(
  allocateSaleLine({ ...line, quantity: 1, batches: [{ batchId: 't', batchNumber: 'T', expiryDate: today, onHand: 1 }] }, today).expired,
  [],
  'expires today',
);

// Manual override takes only the chosen batch, even an expired one (with a warning).
{
  const result = allocateSaleLine({ ...line, quantity: 2, batchId: 'old' }, today);
  expectEqual(result.allocations, [{ batchId: 'old', quantity: 2, expired: true }], 'override');
  expectEqual(result.expired.length, 1, 'override warns on expired');
  expectEqual(
    allocateSaleLine({ ...line, quantity: 4, batchId: 'soon' }, today).shortfall,
    'Not enough stock of Yoghurt (batch L2): 3 on hand, 4 to sell',
    'override shortfall',
  );
}

// Not enough in total: nothing is allocated.
expectEqual(
  allocateSaleLine({ ...line, quantity: 19 }, today),
  { allocations: [], shortfall: 'Not enough stock of Yoghurt: 18 on hand, 19 to sell', expired: [] },
  'total shortfall',
);

// Products without batch tracking sell from the product total.
expectEqual(
  allocateSaleLine({ productName: 'Bread', batchTracking: false, quantity: 2.5, onHand: 3, batches: [] }, today).allocations,
  [{ batchId: null, quantity: 2.5, expired: false }],
  'untracked',
);
expectEqual(
  allocateSaleLine({ productName: 'Bread', batchTracking: false, quantity: 4, onHand: -1, batches: [] }, today).shortfall,
  'Not enough stock of Bread: 0 on hand, 4 to sell',
  'untracked shortfall, negative shown as 0',
);

console.log('fefo tests passed');
