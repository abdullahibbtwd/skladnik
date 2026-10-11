/**
 * Create-subscription field validation + EIK checksum edge cases (QA Batch C).
 */
import assert from 'node:assert/strict';
import {
  isValidEik,
  isValidSubscriptionBuyerEik,
  normaliseSubscriptionBuyerEik,
  validateCreatePlatformSubscription,
} from '@skladnik/shared';

// --- Valid / invalid 9-digit ---
assert.equal(isValidEik('123456786'), true);
assert.equal(isValidEik('123456787'), false);
assert.equal(isValidEik('12AB'), false);
assert.equal(isValidSubscriptionBuyerEik('12AB'), false);
assert.equal(isValidSubscriptionBuyerEik('123456786'), true);

// Checksum=10 edge cases (first mod-11 path returns 10; second path applies)
assert.equal(isValidEik('000000047'), true, '9-digit checksum=10 path');
assert.equal(isValidSubscriptionBuyerEik('000000047'), true);
assert.equal(isValidEik('000000048'), false);

// --- Valid / invalid 13-digit ---
assert.equal(isValidEik('1234567860123'), true);
assert.equal(isValidEik('1234567860124'), false);
assert.equal(isValidEik('1234567860048'), true, '13-digit branch checksum=10 path');
assert.equal(isValidSubscriptionBuyerEik('1234567860048'), true);

// Optional BG-prefixed VAT
assert.equal(isValidSubscriptionBuyerEik('BG123456786'), true);
assert.equal(isValidSubscriptionBuyerEik('bg123456786'), true);
assert.equal(normaliseSubscriptionBuyerEik('BG123456786'), '123456786');
assert.equal(isValidSubscriptionBuyerEik('BG123456787'), false);

// Bare letters / short junk
assert.equal(isValidSubscriptionBuyerEik(''), false);
assert.equal(isValidSubscriptionBuyerEik('123'), false);

// --- Multi-field create validation (price=-50, vat=abc, EIK=12AB) ---
const multi = validateCreatePlatformSubscription({
  plan: 'STARTER',
  maxUsers: 5,
  termMonths: 12,
  priceMinor: -50,
  currency: 'EUR',
  vatRate: 'abc',
  buyerName: 'Buyer OOD',
  buyerEik: '12AB',
  buyerAddress: 'Sofia',
  buyerEmail: 'buyer@example.com',
});
assert.equal(Object.keys(multi).length, 3, `expected 3 errors, got ${JSON.stringify(multi)}`);
assert.equal(multi.priceMinor, 'INVALID_PRICE');
assert.equal(multi.vatRate, 'INVALID_VAT');
assert.equal(multi.buyerEik, 'INVALID_BUYER_EIK');

const ok = validateCreatePlatformSubscription({
  plan: 'PRO',
  maxUsers: 10,
  termMonths: 12,
  priceMinor: 0,
  currency: 'EUR',
  vatRate: 20,
  buyerName: 'Buyer',
  buyerEik: '123456786',
  buyerAddress: 'Addr',
  buyerEmail: 'a@b.co',
});
assert.deepEqual(ok, {});

console.log('create-platform-subscription.eik.test.ts: ok');
