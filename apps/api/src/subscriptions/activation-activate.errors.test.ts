/**
 * Distinct typed activate / transition errors.
 */
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { httpExceptionCode, isApiErrorBody } from '../common/api-error';
import {
  activationCodeAlreadyUsedError,
  invalidActivationCodeError,
  invalidStatusTransitionError,
} from './activation-activate.errors';

const invalid = invalidActivationCodeError();
assert.ok(invalid instanceof BadRequestException);
assert.equal(httpExceptionCode(invalid), 'INVALID_CODE');

const usedAt = new Date('2026-03-15T12:00:00.000Z');
const used = activationCodeAlreadyUsedError(usedAt);
assert.equal(httpExceptionCode(used), 'CODE_ALREADY_USED');
const usedBody = used.getResponse();
assert.ok(isApiErrorBody(usedBody));
assert.equal(usedBody.params?.usedAt, usedAt.toISOString());

const transition = invalidStatusTransitionError('PENDING', 'ACTIVE');
assert.equal(httpExceptionCode(transition), 'INVALID_STATUS_TRANSITION');
const transitionBody = transition.getResponse();
assert.ok(isApiErrorBody(transitionBody));
assert.equal(transitionBody.params?.from, 'PENDING');
assert.equal(transitionBody.params?.to, 'ACTIVE');

console.log('activation-activate.errors.test.ts: ok');
