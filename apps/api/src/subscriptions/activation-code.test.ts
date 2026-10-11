/**
 * Activation code encoding / HMAC / normalize — never log plaintext from production paths.
 */
import assert from 'node:assert/strict';
import {
  ACTIVATION_CODE_LENGTH,
  CROCKFORD_ALPHABET,
  activationCodeHashCandidates,
  hashActivationCode,
  isWellFormedActivationCode,
  issueActivationCode,
  issueLegacyActivationCodeEndingWithEquals,
  normalizeActivationCode,
} from './activation-code';

const pepper = 'test-activation-pepper';

// --- normalize_code (case, whitespace, dashes, "=", empty) ---
assert.equal(normalizeActivationCode(''), '');
assert.equal(normalizeActivationCode('   '), '');
assert.equal(normalizeActivationCode('abcd'), 'ABCD');
assert.equal(normalizeActivationCode('  ab-cd  '), 'ABCD');
assert.equal(normalizeActivationCode('ab cd'), 'ABCD');
assert.equal(normalizeActivationCode('ab=cd='), 'ABCD');
assert.equal(normalizeActivationCode('a b-c=d'), 'ABCD');
assert.equal(normalizeActivationCode('oIl-'), '011');
assert.equal(normalizeActivationCode('\tab\ncd\t'), 'ABCD');

const issued = issueActivationCode(pepper);
assert.equal(issued.normalized.length, ACTIVATION_CODE_LENGTH);
assert.equal(issued.codeHash.length, 64);
assert.equal(normalizeActivationCode(issued.codePrefix).length, 5);
assert.ok(issued.codePrefix.includes('-') || issued.codePrefix.length <= 4, 'prefix uses dashed grouping when >4');
assert.equal(issued.codePrefix, issued.plaintext.slice(0, issued.codePrefix.length));
assert.ok(!issued.plaintext.includes('='), 'new codes must not contain =');
assert.ok(!issued.normalized.includes('='), 'normalized must not contain =');
assert.ok([...issued.normalized].every((ch) => CROCKFORD_ALPHABET.includes(ch)));
assert.equal(issued.plaintext, issued.normalized.match(/.{1,4}/g)!.join('-'));
assert.equal(hashActivationCode(issued.normalized, pepper), issued.codeHash);
assert.ok(isWellFormedActivationCode(issued.plaintext));
assert.ok(isWellFormedActivationCode(issued.normalized.toLowerCase()));
assert.ok(isWellFormedActivationCode(issued.plaintext.replace(/-/g, ' ')));
assert.ok(isWellFormedActivationCode(`  ${issued.normalized}  `));
assert.ok(isWellFormedActivationCode(issued.plaintext.replace(/-/g, '')));

// Redeem-equivalent inputs share one hash
const variants = [
  issued.plaintext,
  issued.plaintext.toLowerCase(),
  `  ${issued.plaintext}  `,
  issued.plaintext.replace(/-/g, ' '),
  issued.plaintext.replace(/-/g, ''),
  `${issued.plaintext}=`,
];
const primaryHash = hashActivationCode(normalizeActivationCode(issued.plaintext), pepper);
for (const variant of variants) {
  const normalized = normalizeActivationCode(variant);
  assert.equal(normalized, issued.normalized, `normalize mismatch for ${JSON.stringify(variant)}`);
  assert.deepEqual(activationCodeHashCandidates(normalized, pepper), [
    primaryHash,
    hashActivationCode(`${normalized}=`, pepper),
  ]);
}

// Wrong length / alphabet rejected
assert.equal(isWellFormedActivationCode('ABCD'), false);
assert.equal(isWellFormedActivationCode('U'.repeat(ACTIVATION_CODE_LENGTH)), false);

// Different pepper → different hash
assert.notEqual(hashActivationCode(issued.normalized, 'other'), issued.codeHash);

// Entropy: two issues differ
const second = issueActivationCode(pepper);
assert.notEqual(second.normalized, issued.normalized);
assert.notEqual(second.codeHash, issued.codeHash);

// Legacy format still well-formed; `=` check survives via hash candidates
const legacyWithEquals = issueLegacyActivationCodeEndingWithEquals(pepper);
assert.ok(legacyWithEquals.normalized.endsWith('='));
assert.ok(legacyWithEquals.plaintext.includes('='));
const legacyStripped = normalizeActivationCode(legacyWithEquals.plaintext);
assert.ok(!legacyStripped.endsWith('='));
assert.ok(isWellFormedActivationCode(legacyWithEquals.plaintext));
assert.ok(isWellFormedActivationCode(legacyStripped), 'legacy payload without = still well-formed');
const legacyCandidates = activationCodeHashCandidates(legacyStripped, pepper);
assert.ok(legacyCandidates.includes(legacyWithEquals.codeHash), 'lookup fallback must hit stored legacy hash');

console.log('activation-code.test.ts: ok');
