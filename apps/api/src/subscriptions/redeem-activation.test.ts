/**
 * Unit checks for calendar month math used when setting expiresAt at activation.
 */
import assert from 'node:assert/strict';
import { addCalendarMonths } from './redeem-activation';

const jan31 = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));
const feb = addCalendarMonths(jan31, 1);
assert.equal(feb.toISOString(), '2026-02-28T12:00:00.000Z');

const mar31 = addCalendarMonths(jan31, 2);
assert.equal(mar31.toISOString(), '2026-03-31T12:00:00.000Z');

const year = addCalendarMonths(new Date(Date.UTC(2026, 3, 15, 8, 30, 0)), 12);
assert.equal(year.toISOString(), '2027-04-15T08:30:00.000Z');

console.log('redeem-activation.test.ts: ok');
