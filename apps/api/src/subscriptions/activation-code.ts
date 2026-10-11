import { createHmac, randomBytes } from 'crypto';

/** Crockford Base32 (no I, L, O, U). */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * New activation codes: exactly 20 Crockford symbols = 100 bits of entropy.
 * Grouped as XXXX-XXXX-XXXX-XXXX-XXXX for display. No padding and no `=` check symbol.
 */
export const ACTIVATION_CODE_LENGTH = 20;

/** Bytes of CSPRNG input for new codes (104 bits; truncated to 100 for encoding). */
const CODE_ENTROPY_BYTES = 13;

/**
 * Legacy codes (pre Batch A): 16 random bytes → 26 Crockford payload symbols +
 * a mod-37 Crockford check symbol (alphabet + `*~$=U`). The check could be `=`,
 * which normalize strips — lookup must try a restored trailing `=`.
 */
const LEGACY_CODE_BYTES = 16;
const LEGACY_PAYLOAD_LENGTH = 26;
const LEGACY_CHECK_ALPHABET = `${CROCKFORD_ALPHABET}*~$=U`;

/** Leading symbols stored/shown as a dashed prefix (e.g. H65Y-1). */
export const CODE_PREFIX_LEN = 5;

/** Default window for redeeming a pending code (independent of subscription term). */
export const ACTIVATION_CODE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type IssuedActivationCode = {
  /** Human-facing code with dashes; shown once. */
  plaintext: string;
  /** Normalized (no separators) for HMAC and storage of prefix. */
  normalized: string;
  codeHash: string;
  codePrefix: string;
  expiresAt: Date;
};

/**
 * Single normalize used everywhere a code is looked up, hashed, or validated.
 * trim → uppercase → strip whitespace, `-`, `=` → map ambiguous glyphs (Crockford).
 */
export function normalizeActivationCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-=]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function hashActivationCode(normalized: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalized, 'utf8').digest('hex');
}

/**
 * Hashes to try when resolving a code. New codes hash the normalized form only.
 * Legacy PENDING rows may have been hashed with a trailing `=` check symbol that
 * normalize strips — include that candidate so those codes still redeem.
 */
export function activationCodeHashCandidates(normalized: string, pepper: string): string[] {
  if (!normalized) return [];
  const primary = hashActivationCode(normalized, pepper);
  const withEquals = hashActivationCode(`${normalized}=`, pepper);
  return primary === withEquals ? [primary] : [primary, withEquals];
}

export function issueActivationCode(pepper: string, now = new Date()): IssuedActivationCode {
  const normalized = encodeCrockfordFixed(randomBytes(CODE_ENTROPY_BYTES), ACTIVATION_CODE_LENGTH);
  return buildIssued(normalized, pepper, now);
}

/**
 * Re-issue the pre–Batch A format (26-char payload + mod-37 check, which may be `=`).
 * Used only in tests / regression for PENDING legacy rows.
 */
export function issueLegacyActivationCode(pepper: string, now = new Date()): IssuedActivationCode {
  const payload = encodeCrockfordPadded(randomBytes(LEGACY_CODE_BYTES));
  if (payload.length !== LEGACY_PAYLOAD_LENGTH) {
    throw new Error(`Unexpected legacy payload length ${payload.length}`);
  }
  const check = legacyCrockfordChecksum(payload);
  return buildIssued(`${payload}${check}`, pepper, now);
}

/**
 * Legacy mint whose check symbol is `=` (the Batch A regression case).
 * Retries random prefixes and varies the last payload symbol until the mod-37
 * check equals `=` (not every 25-char prefix can hit residue 35 with only 32
 * last-symbol choices).
 */
export function issueLegacyActivationCodeEndingWithEquals(
  pepper: string,
  now = new Date(),
): IssuedActivationCode {
  for (let attempt = 0; attempt < 256; attempt++) {
    const prefix = encodeCrockfordPadded(randomBytes(LEGACY_CODE_BYTES)).slice(
      0,
      LEGACY_PAYLOAD_LENGTH - 1,
    );
    for (const ch of CROCKFORD_ALPHABET) {
      const payload = `${prefix}${ch}`;
      if (legacyCrockfordChecksum(payload) === '=') {
        return buildIssued(`${payload}=`, pepper, now);
      }
    }
  }
  throw new Error('Could not mint legacy activation code ending with =');
}

/** True when the normalized form looks like a new or legacy activation code. */
export function isWellFormedActivationCode(raw: string): boolean {
  const normalized = normalizeActivationCode(raw);
  if (!normalized) return false;

  if (normalized.length === ACTIVATION_CODE_LENGTH) {
    return [...normalized].every((ch) => CROCKFORD_ALPHABET.includes(ch));
  }

  // Legacy: payload+check, or payload alone after `=` was stripped by normalize.
  if (normalized.length === LEGACY_PAYLOAD_LENGTH + 1) {
    const payload = normalized.slice(0, -1);
    const check = normalized.slice(-1);
    if (![...payload].every((ch) => CROCKFORD_ALPHABET.includes(ch))) return false;
    if (!LEGACY_CHECK_ALPHABET.includes(check)) return false;
    return legacyCrockfordChecksum(payload) === check;
  }

  if (normalized.length === LEGACY_PAYLOAD_LENGTH) {
    // Check symbol was `=` and was stripped — verify payload+`=` checksum.
    if (![...normalized].every((ch) => CROCKFORD_ALPHABET.includes(ch))) return false;
    return legacyCrockfordChecksum(normalized) === '=';
  }

  return false;
}

function buildIssued(normalized: string, pepper: string, now: Date): IssuedActivationCode {
  return {
    plaintext: formatActivationCode(normalized),
    normalized,
    codeHash: hashActivationCode(normalized, pepper),
    codePrefix: activationCodePrefix(normalized),
    expiresAt: new Date(now.getTime() + ACTIVATION_CODE_TTL_MS),
  };
}

/** Dashed prefix in the same grouping as the full code (XXXX-X for 5 symbols). */
export function activationCodePrefix(normalizedOrRaw: string): string {
  const normalized = normalizeActivationCode(normalizedOrRaw).slice(0, CODE_PREFIX_LEN);
  return formatActivationCode(normalized);
}

/** Display helper: formats legacy undashed prefixes and new dashed ones consistently. */
export function displayActivationCodePrefix(storedPrefix: string | null | undefined): string | null {
  if (!storedPrefix) return null;
  return activationCodePrefix(storedPrefix);
}

/** Encode exactly `length` Crockford symbols (no pad symbols, no trailing `=`). */
function encodeCrockfordFixed(bytes: Buffer, length: number): string {
  const needBits = length * 5;
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  if (bits.length < needBits) {
    throw new Error('Insufficient entropy for activation code');
  }
  bits = bits.slice(0, needBits);
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += CROCKFORD_ALPHABET[parseInt(bits.slice(i, i + 5), 2)]!;
  }
  return out;
}

/** Legacy encoder: pad bit string to a multiple of 5 (produced 26 symbols from 16 bytes). */
function encodeCrockfordPadded(bytes: Buffer): string {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += CROCKFORD_ALPHABET[parseInt(bits.slice(i, i + 5), 2)]!;
  }
  return out;
}

function legacyCrockfordChecksum(payload: string): string {
  let sum = 0;
  for (const ch of payload) {
    const value = CROCKFORD_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('Invalid Crockford character');
    sum = (sum * 32 + value) % 37;
  }
  return LEGACY_CHECK_ALPHABET[sum]!;
}

export function formatActivationCode(normalized: string): string {
  const parts: string[] = [];
  for (let i = 0; i < normalized.length; i += 4) {
    parts.push(normalized.slice(i, i + 4));
  }
  return parts.join('-');
}
