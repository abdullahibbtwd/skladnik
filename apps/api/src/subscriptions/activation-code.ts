import { createHmac, randomBytes } from 'crypto';

/** Crockford Base32 (no I, L, O, U). */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Crockford check symbols: base32 alphabet + `*~$=U` (37 values for mod-37 checksum). */
const CHECK_ALPHABET = `${CROCKFORD_ALPHABET}*~$=U`;

const CODE_BYTES = 16; // 128-bit entropy
const CODE_PREFIX_LEN = 5;
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

/** Normalize user input: uppercase, strip separators, map ambiguous glyphs. */
export function normalizeActivationCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function hashActivationCode(normalized: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalized, 'utf8').digest('hex');
}

export function issueActivationCode(pepper: string, now = new Date()): IssuedActivationCode {
  const payload = encodeCrockford(randomBytes(CODE_BYTES));
  const check = crockfordChecksum(payload);
  const normalized = `${payload}${check}`;
  const plaintext = formatActivationCode(normalized);
  return {
    plaintext,
    normalized,
    codeHash: hashActivationCode(normalized, pepper),
    codePrefix: normalized.slice(0, CODE_PREFIX_LEN),
    expiresAt: new Date(now.getTime() + ACTIVATION_CODE_TTL_MS),
  };
}

/** Verify checksum after normalize; does not check the HMAC/DB. */
export function isWellFormedActivationCode(raw: string): boolean {
  const normalized = normalizeActivationCode(raw);
  if (normalized.length < 2) return false;
  const payload = normalized.slice(0, -1);
  const check = normalized.slice(-1);
  if (![...payload, check].every((ch) => CHECK_ALPHABET.includes(ch))) return false;
  return crockfordChecksum(payload) === check;
}

function encodeCrockford(bytes: Buffer): string {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += CROCKFORD_ALPHABET[parseInt(bits.slice(i, i + 5), 2)]!;
  }
  return out;
}

function crockfordChecksum(payload: string): string {
  let sum = 0;
  for (const ch of payload) {
    const value = CROCKFORD_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('Invalid Crockford character');
    sum = (sum * 32 + value) % 37;
  }
  return CHECK_ALPHABET[sum]!;
}

function formatActivationCode(normalized: string): string {
  const parts: string[] = [];
  for (let i = 0; i < normalized.length; i += 4) {
    parts.push(normalized.slice(i, i + 4));
  }
  return parts.join('-');
}
