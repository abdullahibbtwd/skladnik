/**
 * Unit checks for invoice VAT rounding (half-up on minor units).
 */
import assert from 'node:assert/strict';
import {
  canTransitionInvoiceStatus,
  computeInvoiceTotals,
  computeVatMinor,
  roundHalfUp,
} from '@skladnik/shared';

assert.equal(roundHalfUp(0.5), 1);
assert.equal(roundHalfUp(1.4), 1);
assert.equal(roundHalfUp(1.5), 2);
assert.equal(roundHalfUp(2.5), 3);
assert.equal(roundHalfUp(0), 0);

// 20% of 10000 = 2000 exact
assert.deepEqual(computeInvoiceTotals(10000, 20), {
  subtotalMinor: 10000,
  vatMinor: 2000,
  totalMinor: 12000,
});

// Edge: 20% of 1 minor → 0.2 → rounds to 0
assert.equal(computeVatMinor(1, 20), 0);
assert.deepEqual(computeInvoiceTotals(1, 20), { subtotalMinor: 1, vatMinor: 0, totalMinor: 1 });

// Edge: 20% of 3 → 0.6 → 1
assert.equal(computeVatMinor(3, 20), 1);

// Edge: 20% of 333 → 66.6 → 67
assert.equal(computeVatMinor(333, 20), 67);

// Zero VAT
assert.deepEqual(computeInvoiceTotals(9999, 0), {
  subtotalMinor: 9999,
  vatMinor: 0,
  totalMinor: 9999,
});

assert.equal(canTransitionInvoiceStatus('ISSUED', 'PAID'), true);
assert.equal(canTransitionInvoiceStatus('ISSUED', 'VOID'), true);
assert.equal(canTransitionInvoiceStatus('PAID', 'VOID'), false);
assert.equal(canTransitionInvoiceStatus('VOID', 'PAID'), false);
assert.equal(canTransitionInvoiceStatus('ISSUED', 'ISSUED'), false);

console.log('invoice-vat.test.ts: ok');
