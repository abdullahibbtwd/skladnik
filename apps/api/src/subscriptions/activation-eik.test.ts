/**
 * EIK mismatch: WARN requires confirm; BLOCK rejects. Uses shared mode + error helpers.
 */
import assert from 'node:assert/strict';
import { httpExceptionCode, isApiErrorBody } from '../common/api-error';
import {
  eikMismatchBlockedError,
  eikMismatchConfirmRequiredError,
} from './activation-activate.errors';
import { DEFAULT_ACTIVATION_EIK_MISMATCH_MODE, normaliseEik } from '@skladnik/shared';

assert.equal(DEFAULT_ACTIVATION_EIK_MISMATCH_MODE, 'WARN');

const buyer = '175074406';
const company = '131134023';
assert.notEqual(normaliseEik(buyer), normaliseEik(company));

const blocked = eikMismatchBlockedError(buyer, company);
assert.equal(httpExceptionCode(blocked), 'EIK_MISMATCH');
const blockedBody = blocked.getResponse();
assert.ok(isApiErrorBody(blockedBody));
assert.equal(blockedBody.params?.buyerEik, buyer);

const confirm = eikMismatchConfirmRequiredError(buyer, company);
assert.equal(httpExceptionCode(confirm), 'EIK_MISMATCH_CONFIRM_REQUIRED');
assert.notEqual(httpExceptionCode(confirm), httpExceptionCode(blocked));

/** Policy helper mirrored by TenantSubscriptionsService.activate */
function decideEikGate(input: {
  mode: 'WARN' | 'BLOCK';
  matches: boolean;
  confirm: boolean;
}): 'ok' | 'block' | 'confirm' {
  if (input.matches) return 'ok';
  if (input.mode === 'BLOCK') return 'block';
  if (!input.confirm) return 'confirm';
  return 'ok';
}

assert.equal(decideEikGate({ mode: 'WARN', matches: true, confirm: false }), 'ok');
assert.equal(decideEikGate({ mode: 'WARN', matches: false, confirm: false }), 'confirm');
assert.equal(decideEikGate({ mode: 'WARN', matches: false, confirm: true }), 'ok');
assert.equal(decideEikGate({ mode: 'BLOCK', matches: false, confirm: true }), 'block');
assert.equal(decideEikGate({ mode: 'BLOCK', matches: false, confirm: false }), 'block');

console.log('activation-eik.test.ts: ok');
