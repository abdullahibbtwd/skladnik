/**
 * Activation code encoding / HMAC — never log plaintext from production paths.
 */
import assert from 'node:assert/strict';
import {
  hashActivationCode,
  isWellFormedActivationCode,
  issueActivationCode,
  normalizeActivationCode,
} from './activation-code';

const pepper = 'test-activation-pepper';

const issued = issueActivationCode(pepper);
assert.equal(issued.codeHash.length, 64);
assert.equal(issued.codePrefix.length, 5);
assert.ok(issued.plaintext.includes('-'));
assert.equal(hashActivationCode(issued.normalized, pepper), issued.codeHash);
assert.ok(isWellFormedActivationCode(issued.plaintext));
assert.ok(isWellFormedActivationCode(issued.normalized.toLowerCase()));
assert.ok(isWellFormedActivationCode(issued.plaintext.replace(/-/g, ' ')));

// Ambiguous glyphs normalize
assert.equal(normalizeActivationCode('oIl-'), '011');

// Wrong checksum rejected
const bad = `${issued.normalized.slice(0, -1)}0`;
if (bad.endsWith(issued.normalized.slice(-1))) {
  // unlucky collision with real check — flip another char
  assert.equal(isWellFormedActivationCode(`${issued.normalized.slice(0, -2)}00`), false);
} else {
  assert.equal(isWellFormedActivationCode(bad), false);
}

// Different pepper → different hash
assert.notEqual(hashActivationCode(issued.normalized, 'other'), issued.codeHash);

// Entropy: two issues differ
const second = issueActivationCode(pepper);
assert.notEqual(second.normalized, issued.normalized);
assert.notEqual(second.codeHash, issued.codeHash);

console.log('activation-code.test.ts: ok');
