/**
 * Unit checks for the subscription status state machine (platform entitlement).
 */
import assert from 'node:assert/strict';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS,
  SUBSCRIPTION_CREATE_STATUSES,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_TRANSITIONS,
  canManualTransitionSubscriptionStatus,
  canSystemTransitionSubscriptionStatus,
  canTransitionSubscriptionStatus,
  isLiveSubscriptionStatus,
  isSubscriptionCreateStatus,
  type SubscriptionStatus,
} from '@skladnik/shared';

assert.deepEqual(
  [...SUBSCRIPTION_STATUSES].sort(),
  ['ACTIVE', 'EXPIRED', 'PENDING', 'QUEUED', 'REVOKED', 'SUPERSEDED', 'SUSPENDED', 'TRIAL'].sort(),
  'all statuses listed',
);

assert.equal(isLiveSubscriptionStatus('PENDING'), false);
assert.equal(isLiveSubscriptionStatus('REVOKED'), false);
assert.equal(isLiveSubscriptionStatus('SUPERSEDED'), false);
assert.equal(isLiveSubscriptionStatus('QUEUED'), false);
for (const status of LIVE_SUBSCRIPTION_STATUSES) {
  assert.equal(isLiveSubscriptionStatus(status), true, `${status} is live`);
}

for (const status of SUBSCRIPTION_CREATE_STATUSES) {
  assert.equal(isSubscriptionCreateStatus(status), true, `${status} creatable`);
}

// Manual map: PENDING → ACTIVE removed (activation is code-only).
assert.equal(canManualTransitionSubscriptionStatus('PENDING', 'ACTIVE'), false);
assert.equal(canTransitionSubscriptionStatus('PENDING', 'ACTIVE'), false);
assert.equal(canManualTransitionSubscriptionStatus('PENDING', 'REVOKED'), true);
assert.equal(canManualTransitionSubscriptionStatus('ACTIVE', 'REVOKED'), true);
assert.equal(canManualTransitionSubscriptionStatus('ACTIVE', 'EXPIRED'), false);
assert.equal(canSystemTransitionSubscriptionStatus('ACTIVE', 'EXPIRED'), true);

const allowedManual: Array<[SubscriptionStatus, SubscriptionStatus]> = [
  ['PENDING', 'REVOKED'],
  ['TRIAL', 'SUSPENDED'],
  ['TRIAL', 'REVOKED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'REVOKED'],
  ['EXPIRED', 'REVOKED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'REVOKED'],
  ['QUEUED', 'REVOKED'],
];

for (const [from, to] of allowedManual) {
  assert.equal(canManualTransitionSubscriptionStatus(from, to), true, `${from} → ${to}`);
}

const forbiddenManual: Array<[SubscriptionStatus, SubscriptionStatus]> = [
  ['PENDING', 'ACTIVE'],
  ['PENDING', 'TRIAL'],
  ['ACTIVE', 'EXPIRED'],
  ['EXPIRED', 'ACTIVE'],
  ['SUPERSEDED', 'ACTIVE'],
  ['REVOKED', 'ACTIVE'],
  ['QUEUED', 'ACTIVE'],
];

for (const [from, to] of forbiddenManual) {
  assert.equal(canManualTransitionSubscriptionStatus(from, to), false, `forbidden ${from} → ${to}`);
}

assert.deepEqual(SUBSCRIPTION_STATUS_TRANSITIONS, MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS);

for (const from of SUBSCRIPTION_STATUSES) {
  const targets = new Set(MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS[from]);
  for (const to of SUBSCRIPTION_STATUSES) {
    assert.equal(
      canManualTransitionSubscriptionStatus(from, to),
      targets.has(to),
      `map consistency ${from} → ${to}`,
    );
  }
}

assert.equal(MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS.REVOKED.length, 0, 'REVOKED is terminal');
assert.equal(MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS.SUPERSEDED.length, 0, 'SUPERSEDED is terminal');

console.log('subscription-status.test.ts: ok');
