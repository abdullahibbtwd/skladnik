/**
 * Unit checks for expiry reminder day buckets and expiring-soon banner.
 */
import assert from 'node:assert/strict';
import {
  daysUntilExpiry,
  isExpiringSoon,
  reminderDaysForExpiry,
  shouldSendExpiryReminder,
  EXPIRY_REMINDER_DAYS,
  TRIAL_DAYS,
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

// Reproduce: signup-day 14-day trial lands in the "14 days left" bucket.
{
  const signupAt = new Date('2026-10-06T07:30:00.000Z');
  const cronAt = new Date('2026-10-06T08:00:00.000Z');
  const trialExpiresAt = new Date(signupAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  assert.equal(reminderDaysForExpiry(trialExpiresAt, cronAt), 14);
  assert.equal(
    shouldSendExpiryReminder({
      status: 'TRIAL',
      startsAt: signupAt,
      daysBefore: 14,
      now: cronAt,
    }),
    false,
    'new 14-day trial must not get the signup-day "14 days left" email',
  );
  assert.equal(
    shouldSendExpiryReminder({
      status: 'TRIAL',
      startsAt: signupAt,
      daysBefore: 30,
      now: cronAt,
    }),
    false,
    'trial must skip reminder buckets >= trial length',
  );
}

// After 24h, TRIAL still skips buckets >= trial length, but allows shorter ones.
{
  const startsAt = new Date('2026-09-22T12:00:00.000Z');
  const day7 = new Date('2026-10-06T08:00:00.000Z');
  assert.equal(
    shouldSendExpiryReminder({ status: 'TRIAL', startsAt, daysBefore: 14, now: day7 }),
    false,
  );
  assert.equal(
    shouldSendExpiryReminder({ status: 'TRIAL', startsAt, daysBefore: 7, now: day7 }),
    true,
  );
  assert.equal(
    shouldSendExpiryReminder({ status: 'TRIAL', startsAt, daysBefore: 1, now: day7 }),
    true,
  );
}

// ACTIVE paid terms still receive the 14-day reminder once older than 24h.
{
  const startsAt = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(
    shouldSendExpiryReminder({ status: 'ACTIVE', startsAt, daysBefore: 14, now }),
    true,
  );
  assert.equal(
    shouldSendExpiryReminder({
      status: 'ACTIVE',
      startsAt: now,
      daysBefore: 14,
      now,
    }),
    false,
    'subscriptions younger than 24h are skipped regardless of status',
  );
}

console.log('subscription-reminders.test.ts: ok');
