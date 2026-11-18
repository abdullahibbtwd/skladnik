/**
 * Ensures the quote endpoint rate-limit rule is wired for IP limiting.
 */
import assert from 'node:assert/strict';
import { RATE_LIMIT_KEY, type RateLimitRule } from '../auth/decorators/rate-limit.decorator';
import { QuoteRequestsController } from './quote-requests.controller';

const rules = Reflect.getMetadata(RATE_LIMIT_KEY, QuoteRequestsController.prototype.create) as
  | RateLimitRule[]
  | undefined;

assert.ok(rules?.length, 'quote create must declare @RateLimit');
assert.equal(rules![0].name, 'quote-request');
assert.equal(rules![0].by, 'ip');
assert.ok(rules![0].limit >= 1);
assert.ok(rules![0].windowSeconds >= 60);

console.log('quote-rate-limit.test.ts: ok');
