/**
 * Platform list search normalize + empty-state kinds (QA Batch D).
 */
import assert from 'node:assert/strict';
import { activationCodePrefix, normalizeActivationCode } from './activation-code';
import {
  platformSubscriptionSearchOr,
  platformSubscriptionsEmptyKind,
} from './platform-subscription-search';

assert.equal(normalizeActivationCode('H65Y-1'), 'H65Y1');
assert.equal(normalizeActivationCode('h65y1'), 'H65Y1');
assert.equal(normalizeActivationCode('H65Y'), 'H65Y');
assert.equal(activationCodePrefix('H65Y1'), 'H65Y-1');
assert.equal(activationCodePrefix('H65Y-1'), 'H65Y-1');

for (const term of ['H65Y', 'H65Y-1', 'h65y1']) {
  const clauses = platformSubscriptionSearchOr(term);
  const codeClauses = clauses.filter((c) => c.activationCodes);
  assert.ok(codeClauses.length >= 1, `expected code search for ${term}`);
  const prefixes = codeClauses.map((c) => {
    const some = c.activationCodes?.some as { codePrefix?: { startsWith?: string } };
    return some?.codePrefix?.startsWith;
  });
  const normalized = normalizeActivationCode(term);
  assert.ok(
    prefixes.some((p) => p === normalized || p === activationCodePrefix(normalized)),
    `search ${term} should include normalized/dashed prefix candidates: ${JSON.stringify(prefixes)}`,
  );
}

assert.equal(platformSubscriptionsEmptyKind({ rowCount: 0, hasFilters: false }), 'empty');
assert.equal(platformSubscriptionsEmptyKind({ rowCount: 0, hasFilters: true }), 'no_results');
assert.equal(platformSubscriptionsEmptyKind({ rowCount: 3, hasFilters: true }), null);
assert.equal(platformSubscriptionsEmptyKind({ rowCount: 1, hasFilters: false }), null);

console.log('platform-subscription-search.test.ts: ok');
