import assert from 'node:assert/strict';
import { formatAutomaticBatchNumber, isAutomaticBatchNumber } from './auto-batch';

assert.equal(formatAutomaticBatchNumber('2026-10-01', 1), 'A-20261001-01');
assert.equal(formatAutomaticBatchNumber('20261001', 12), 'A-20261001-12');
assert.equal(isAutomaticBatchNumber('A-20261001-01'), true);
assert.equal(isAutomaticBatchNumber('MP-2409'), false);
assert.equal(isAutomaticBatchNumber('A-2026-01'), false);

console.log('auto-batch tests passed');
