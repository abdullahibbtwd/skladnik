/**
 * Activate endpoint must rate-limit by IP and user so INVALID_CODE vs
 * CODE_ALREADY_USED cannot be used to enumerate codes.
 */
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { RATE_LIMIT_KEY } from '../auth/decorators/rate-limit.decorator';
import { SUBSCRIPTION_ACTIVATE_RATE_LIMITS } from './activation-activate.limits';
import { TenantSubscriptionsController } from './tenant-subscriptions.controller';

assert.ok(SUBSCRIPTION_ACTIVATE_RATE_LIMITS.some((rule) => rule.by === 'ip' && rule.limit > 0));
assert.ok(SUBSCRIPTION_ACTIVATE_RATE_LIMITS.some((rule) => rule.by === 'user' && rule.limit > 0));
assert.ok(SUBSCRIPTION_ACTIVATE_RATE_LIMITS.some((rule) => rule.by === 'company' && rule.limit > 0));
for (const rule of SUBSCRIPTION_ACTIVATE_RATE_LIMITS) {
  assert.ok(rule.windowSeconds >= 60);
  assert.ok(rule.limit <= 30);
}

const wired = Reflect.getMetadata(
  RATE_LIMIT_KEY,
  TenantSubscriptionsController.prototype.activate,
) as typeof SUBSCRIPTION_ACTIVATE_RATE_LIMITS | undefined;

assert.ok(wired, 'activate handler must declare @RateLimit metadata');
assert.equal(wired.length, SUBSCRIPTION_ACTIVATE_RATE_LIMITS.length);
assert.deepEqual(
  [...wired].map((rule) => ({ name: rule.name, by: rule.by, limit: rule.limit })),
  SUBSCRIPTION_ACTIVATE_RATE_LIMITS.map((rule) => ({ name: rule.name, by: rule.by, limit: rule.limit })),
);

console.log('activation-activate.limits.test.ts: ok');
