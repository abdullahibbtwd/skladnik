import assert from 'node:assert/strict';
import { stockAsOfEnd } from './stock-as-of';

const end = stockAsOfEnd('2026-09-30');
assert.equal(end.toISOString(), '2026-10-01T00:00:00.000Z');

const mid = stockAsOfEnd('2026-10-01');
assert.equal(mid.toISOString(), '2026-10-02T00:00:00.000Z');

// A movement dated after the as-of day must fall outside [epoch, stockAsOfEnd).
const future = new Date('2027-03-12T12:00:00.000Z');
assert.equal(future >= stockAsOfEnd('2026-10-31'), true, 'future movement after Oct 2026 as-of');

console.log('stock-as-of.test.ts: ok');
