/**
 * Unit checks for the subscription status state machine (platform entitlement).
 */
import assert from 'node:assert/strict';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_CREATE_STATUSES,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_TRANSITIONS,
  canTransitionSubscriptionStatus,
  isLiveSubscriptionStatus,
  isSubscriptionCreateStatus,
  type SubscriptionStatus,
} from '@skladnik/shared';

assert.deepEqual(
  [...SUBSCRIPTION_STATUSES].sort(),
  ['ACTIVE', 'EXPIRED', 'PENDING', 'REVOKED', 'SUSPENDED', 'TRIAL'].sort(),
  'all statuses listed',
);

assert.equal(isLiveSubscriptionStatus('PENDING'), false);
assert.equal(isLiveSubscriptionStatus('REVOKED'), false);
for (const status of LIVE_SUBSCRIPTION_STATUSES) {
  assert.equal(isLiveSubscriptionStatus(status), true, `${status} is live`);
}

for (const status of SUBSCRIPTION_CREATE_STATUSES) {
  assert.equal(isSubscriptionCreateStatus(status), true, `${status} creatable`);
}
assert.equal(isSubscriptionCreateStatus('ACTIVE'), false);
assert.equal(isSubscriptionCreateStatus('EXPIRED'), false);
assert.equal(isSubscriptionCreateStatus('SUSPENDED'), false);
assert.equal(isSubscriptionCreateStatus('REVOKED'), false);

const allowed: Array<[SubscriptionStatus, SubscriptionStatus]> = [
  ['PENDING', 'ACTIVE'],
  ['PENDING', 'REVOKED'],
  ['TRIAL', 'ACTIVE'],
  ['TRIAL', 'EXPIRED'],
  ['TRIAL', 'SUSPENDED'],
  ['TRIAL', 'REVOKED'],
  ['ACTIVE', 'EXPIRED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'REVOKED'],
  ['EXPIRED', 'ACTIVE'],
  ['EXPIRED', 'REVOKED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'EXPIRED'],
  ['SUSPENDED', 'REVOKED'],
];

for (const [from, to] of allowed) {
  assert.equal(canTransitionSubscriptionStatus(from, to), true, `${from} → ${to}`);
}

const forbidden: Array<[SubscriptionStatus, SubscriptionStatus]> = [
  ['PENDING', 'PENDING'],
  ['PENDING', 'TRIAL'],
  ['PENDING', 'EXPIRED'],
  ['PENDING', 'SUSPENDED'],
  ['ACTIVE', 'PENDING'],
  ['ACTIVE', 'TRIAL'],
  ['ACTIVE', 'ACTIVE'],
  ['REVOKED', 'ACTIVE'],
  ['REVOKED', 'PENDING'],
  ['REVOKED', 'REVOKED'],
  ['EXPIRED', 'SUSPENDED'],
  ['EXPIRED', 'TRIAL'],
  ['SUSPENDED', 'TRIAL'],
  ['SUSPENDED', 'PENDING'],
  ['TRIAL', 'PENDING'],
];

for (const [from, to] of forbidden) {
  assert.equal(canTransitionSubscriptionStatus(from, to), false, `forbidden ${from} → ${to}`);
}

// Exhaustive: every transition in the map is reported as allowed; nothing else is.
for (const from of SUBSCRIPTION_STATUSES) {
  const targets = new Set(SUBSCRIPTION_STATUS_TRANSITIONS[from]);
  for (const to of SUBSCRIPTION_STATUSES) {
    assert.equal(
      canTransitionSubscriptionStatus(from, to),
      targets.has(to),
      `map consistency ${from} → ${to}`,
    );
  }
}

assert.equal(SUBSCRIPTION_STATUS_TRANSITIONS.REVOKED.length, 0, 'REVOKED is terminal');

console.log('subscription-status.test.ts: ok');
