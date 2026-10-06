import assert from 'node:assert/strict';
import { wouldSubscriptionBlock } from './subscription-allowlist';

assert.equal(wouldSubscriptionBlock('full', 'POST', false), false);
assert.equal(wouldSubscriptionBlock('full', 'POST', true), false);

assert.equal(wouldSubscriptionBlock('read_only', 'GET', false), false);
assert.equal(wouldSubscriptionBlock('read_only', 'HEAD', false), false);
assert.equal(wouldSubscriptionBlock('read_only', 'POST', false), true);
assert.equal(wouldSubscriptionBlock('read_only', 'POST', true), false);
assert.equal(wouldSubscriptionBlock('read_only', 'PATCH', true), false);

assert.equal(wouldSubscriptionBlock('none', 'GET', false), true);
assert.equal(wouldSubscriptionBlock('none', 'GET', true), false);
assert.equal(wouldSubscriptionBlock('none', 'POST', true), false);

console.log('subscription-allowlist.test.ts: ok');
