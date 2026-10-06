/**
 * Unit checks for expiry reminder day buckets and expiring-soon banner.
 */
import assert from 'node:assert/strict';
import {
  daysUntilExpiry,
  isExpiringSoon,
  reminderDaysForExpiry,
  EXPIRY_REMINDER_DAYS,
} from '@skladnik/shared';

const now = new Date('2026-10-06T12:00:00.000Z');

assert.equal(daysUntilExpiry(new Date('2026-10-06T23:00:00.000Z'), now), 0);
assert.equal(daysUntilExpiry(new Date('2026-10-07T01:00:00.000Z'), now), 1);
assert.equal(daysUntilExpiry(new Date('2026-11-05T12:00:00.000Z'), now), 30);
assert.equal(daysUntilExpiry(new Date('2026-10-05T12:00:00.000Z'), now), -1);

assert.equal(reminderDaysForExpiry(new Date('2026-11-05T12:00:00.000Z'), now), 30);
assert.equal(reminderDaysForExpiry(new Date('2026-10-20T12:00:00.000Z'), now), 14);
assert.equal(reminderDaysForExpiry(new Date('2026-10-13T12:00:00.000Z'), now), 7);
assert.equal(reminderDaysForExpiry(new Date('2026-10-07T12:00:00.000Z'), now), 1);
assert.equal(reminderDaysForExpiry(new Date('2026-10-10T12:00:00.000Z'), now), null);

assert.deepEqual([...EXPIRY_REMINDER_DAYS], [30, 14, 7, 1]);

assert.equal(isExpiringSoon(new Date('2026-11-05T12:00:00.000Z'), now), true);
assert.equal(isExpiringSoon(new Date('2026-11-06T12:00:00.000Z'), now), false);
assert.equal(isExpiringSoon(new Date('2026-10-05T12:00:00.000Z'), now), false);
assert.equal(isExpiringSoon(null, now), false);

console.log('subscription-reminders.test.ts: ok');
