/**
 * DEFAULT_ACTIVATION_LIFECYCLE_RULES — renew / upgrade / downgrade schedule math.
 */
import assert from 'node:assert/strict';
import {
  addCalendarMonths,
  classifyActivationKind,
  computeActivationSchedule,
} from '@skladnik/shared';

const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)); // 15 Jun 2026

// Renewing 30 days before expiry => expiry = old_expiry + term
{
  const currentExpires = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // 15 Jul
  const schedule = computeActivationSchedule({
    newPlan: 'PRO',
    termMonths: 12,
    now,
    current: { plan: 'PRO', expiresAt: currentExpires },
  });
  assert.equal(schedule.kind, 'renew');
  assert.equal(schedule.status, 'ACTIVE');
  assert.equal(schedule.supersedeCurrent, true);
  assert.equal(schedule.expiresAt.toISOString(), addCalendarMonths(currentExpires, 12).toISOString());
}

// Same-day activation on an active plan => full term added from now (max(now, expiry)=now when equal)
{
  const schedule = computeActivationSchedule({
    newPlan: 'STARTER',
    termMonths: 6,
    now,
    current: { plan: 'STARTER', expiresAt: now },
  });
  assert.equal(schedule.kind, 'renew');
  assert.equal(schedule.expiresAt.toISOString(), addCalendarMonths(now, 6).toISOString());
}

// Upgrade: starts now, carries remaining days
{
  const currentExpires = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // +30 days
  const remainingMs = currentExpires.getTime() - now.getTime();
  const schedule = computeActivationSchedule({
    newPlan: 'PRO',
    termMonths: 12,
    now,
    current: { plan: 'STARTER', expiresAt: currentExpires },
  });
  assert.equal(schedule.kind, 'upgrade');
  assert.equal(schedule.status, 'ACTIVE');
  assert.equal(schedule.supersedeCurrent, true);
  assert.equal(schedule.startsAt.toISOString(), now.toISOString());
  const expected = new Date(addCalendarMonths(now, 12).getTime() + remainingMs);
  assert.equal(schedule.expiresAt.toISOString(), expected.toISOString());
}

// Downgrade: queued until current ends
{
  const currentExpires = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));
  const schedule = computeActivationSchedule({
    newPlan: 'STARTER',
    termMonths: 12,
    now,
    current: { plan: 'PRO', expiresAt: currentExpires },
  });
  assert.equal(schedule.kind, 'downgrade');
  assert.equal(schedule.status, 'QUEUED');
  assert.equal(schedule.supersedeCurrent, false);
  assert.equal(schedule.startsAt.toISOString(), currentExpires.toISOString());
  assert.equal(schedule.expiresAt.toISOString(), addCalendarMonths(currentExpires, 12).toISOString());
}

assert.equal(classifyActivationKind(null, 'PRO'), 'new');
assert.equal(classifyActivationKind('PRO', 'PRO'), 'renew');
assert.equal(classifyActivationKind('STARTER', 'MULTI_LOCATION'), 'upgrade');
assert.equal(classifyActivationKind('MULTI_LOCATION', 'STARTER'), 'downgrade');

console.log('activation-lifecycle.test.ts: ok');
