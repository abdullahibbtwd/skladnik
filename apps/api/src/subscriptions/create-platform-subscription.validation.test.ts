/**
 * Create-subscription validation: multi-field API errors + no side effects on failure.
 */
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import {
  isValidEik,
  isValidSubscriptionBuyerEik,
  validateCreatePlatformSubscription,
} from '@skladnik/shared';
import { isApiErrorBody } from '../common/api-error';
import { apiValidationFailed } from '../common/api-error';

// EIK unit coverage (also in shared test; re-assert for API suite)
assert.equal(isValidEik('123456786'), true);
assert.equal(isValidEik('000000047'), true, '9-digit checksum=10');
assert.equal(isValidEik('1234567860048'), true, '13-digit branch checksum=10');
assert.equal(isValidSubscriptionBuyerEik('12AB'), false);
assert.equal(isValidSubscriptionBuyerEik('BG123456786'), true);

const fieldErrors = validateCreatePlatformSubscription({
  plan: 'STARTER',
  maxUsers: 5,
  termMonths: 12,
  priceMinor: -50,
  currency: 'EUR',
  vatRate: 'abc',
  buyerName: 'Buyer',
  buyerEik: '12AB',
  buyerAddress: 'Sofia',
  buyerEmail: 'buyer@example.com',
});
assert.equal(Object.keys(fieldErrors).sort().join(','), 'buyerEik,priceMinor,vatRate');
assert.equal(fieldErrors.priceMinor, 'INVALID_PRICE');
assert.equal(fieldErrors.vatRate, 'INVALID_VAT');
assert.equal(fieldErrors.buyerEik, 'INVALID_BUYER_EIK');

const ex = apiValidationFailed(fieldErrors);
assert.ok(ex instanceof BadRequestException);
const body = ex.getResponse();
assert.ok(isApiErrorBody(body));
assert.equal(body.code, 'VALIDATION_FAILED');
assert.ok(body.fieldErrors);
assert.equal(Object.keys(body.fieldErrors!).length, 3);
assert.equal(body.fieldErrors!.buyerEik, 'INVALID_BUYER_EIK');

console.log('create-platform-subscription.validation.test.ts: ok');
