/**
 * CAF-01: café invoice quantity cells, plus the Mini Market "24 бр." case that already worked.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { documentTotals, reconcileTotals } from '@skladnik/shared';
import { parseQuantityCell, resolveScannedQuantity, scanLineChecks } from './quantity-cell';
import { CAFE_INVOICE_LINES, CAFE_INVOICE_TOTALS } from './fixtures/cafe-invoice.expected';

function expectQty(
  label: string,
  input: Parameters<typeof resolveScannedQuantity>[0],
  quantity: number,
  unit: string | null,
  flags: { quantityCheck?: boolean; unitCheck?: boolean } = {},
) {
  const resolved = resolveScannedQuantity(input);
  assert.equal(resolved.quantity, quantity, `${label} quantity ${resolved.quantity}`);
  assert.equal(resolved.unit, unit, `${label} unit ${resolved.unit}`);
  assert.equal(resolved.quantityCheck, flags.quantityCheck ?? false, `${label} quantity flag`);
  assert.equal(resolved.unitCheck, flags.unitCheck ?? false, `${label} unit flag`);
}

// Pack size in the name is not the quantity. The cell is.
assert.equal(parseQuantityCell('Мляко прясно 3,5% 1 л'), null, 'a product name is not a quantity cell');
expectQty('milk cell, model said 1', { printed: '12 л', modelQty: 1, productUnit: 'L' }, 12, 'L');
expectQty('beans', { printed: '2 кг', modelQty: 1, productUnit: 'KG' }, 2, 'KG');
expectQty('cream', { printed: '2 л', modelQty: 1, productUnit: 'L' }, 2, 'L');
expectQty('decimal comma', { printed: '1,5 кг', modelQty: 1, productUnit: 'KG' }, 1.5, 'KG');
expectQty('ml into litres', { printed: '500 мл', modelQty: 1, productUnit: 'L' }, 0.5, 'L');
expectQty('grams into kg', { printed: '250 г', modelQty: 1, productUnit: 'KG' }, 0.25, 'KG');

// Mini Market: the model already split the number. Do not turn it into 1.
expectQty('24 бр. already split', { printed: 'бр.', modelQty: 24, productUnit: 'PCS' }, 24, 'PCS');
expectQty('24 бр. glued into the cell', { printed: '24 бр.', modelQty: 1, productUnit: 'PCS' }, 24, 'PCS');

// Incompatible: keep the parsed quantity and unit, flag the measure. Do not guess.
expectQty(
  'carton vs pieces',
  { printed: '2 кашон', modelQty: 1, productUnit: 'PCS' },
  2,
  'CARTON',
  { unitCheck: true },
);

// Linking a suggestion must not reset a parsed line to 1 / the product default.
expectQty('link keeps 12 л', { printed: '12 л', modelQty: 1, productUnit: 'L' }, 12, 'L');
expectQty(
  'reviewer number is kept',
  { printed: '12 л', modelQty: 1, productUnit: 'L', keepQuantity: 10 },
  10,
  'L',
  { quantityCheck: true },
);

const storedWrong = scanLineChecks({ printed: '12 л', quantity: 1, productUnit: 'L' });
assert.equal(storedWrong.quantityCheck, true, 'stored 1 vs printed 12');
const confirmed = scanLineChecks({ printed: '12 л', quantity: 1, productUnit: 'L', quantityConfirmed: true });
assert.equal(confirmed.quantityCheck, false, 'confirmation clears the quantity flag');
const storedRight = scanLineChecks({ printed: '12 л', quantity: 12, productUnit: 'L' });
assert.equal(storedRight.quantityCheck, false, 'stored 12 agrees with the cell');

// Café fixture: the model dumped the whole cell into the unit and left qty at 1.
const resolved = CAFE_INVOICE_LINES.map((line) =>
  resolveScannedQuantity({ printed: line.printedUnit, modelQty: line.modelQty, productUnit: line.productUnit }),
);
assert.deepEqual(
  resolved.map((row) => ({ quantity: row.quantity, unit: row.unit, quantityCheck: row.quantityCheck, unitCheck: row.unitCheck })),
  [
    { quantity: 12, unit: 'L', quantityCheck: false, unitCheck: false },
    { quantity: 2, unit: 'KG', quantityCheck: false, unitCheck: false },
    { quantity: 2, unit: 'L', quantityCheck: false, unitCheck: false },
  ],
);
assert.deepEqual(
  CAFE_INVOICE_LINES.map((line) => ({ batch: line.batch, expiry: line.expiry })),
  [
    { batch: 'ML-2710', expiry: '2026-10-10' },
    { batch: 'AR-0926', expiry: '2027-06-30' },
    { batch: 'SM-1001', expiry: '2026-10-05' },
  ],
);

const totals = reconcileTotals({
  type: 'INVOICE',
  lineCount: CAFE_INVOICE_LINES.length,
  calculated: documentTotals(
    CAFE_INVOICE_LINES.map((line, index) => ({
      net: Math.round(resolved[index]!.quantity * line.unitPrice * 100) / 100,
      rate: 20,
    })),
  ),
  printed: {
    taxableBase: CAFE_INVOICE_TOTALS.taxableBase,
    vat: CAFE_INVOICE_TOTALS.vatAmount,
    total: CAFE_INVOICE_TOTALS.grossTotal,
  },
});
assert.equal(totals.status, 'MATCH', `café totals ${totals.status} ${JSON.stringify(totals.calculated)}`);
assert.equal(totals.calculated.taxableBase, 61);
assert.equal(totals.calculated.vat, 12.2);
assert.equal(totals.calculated.total, 73.2);

// Name pack size must not win over the cell, even when the name says 1 л.
const milkName = 'Мляко прясно 3,5% 1 л';
assert.equal(parseQuantityCell(milkName), null, milkName);
expectQty('cell wins over the name', { printed: '12 л', modelQty: 1, productUnit: 'L' }, 12, 'L');

const photo = path.join(__dirname, 'fixtures', 'cafe-invoice.jpg');
const photoStat = fs.statSync(photo);
assert.ok(photoStat.size > 100_000, `café invoice photo is ${photoStat.size} bytes`);

console.log('quantity-cell tests passed');
