import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';

authenticator.options = { window: 1 };

const ISSUER = 'Skladnik Platform';

/** AES-256-GCM encrypt; `keyMaterial` is any high-entropy secret (hashed to 32 bytes). */
export function encryptTotpSecret(plaintext: string, keyMaterial: string): string {
  const key = deriveKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${ciphertext.toString('hex')}`;
}

export function decryptTotpSecret(payload: string, keyMaterial: string): string {
  const [ivHex, tagHex, dataHex] = payload.split('.');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted TOTP secret');
  }
  const key = deriveKey(keyMaterial);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotpCode(code: string, secret: string): boolean {
  return verifyTotpTimestep(code, secret) !== null;
}

/**
 * Verify a TOTP code and return the absolute timestep that matched (for replay detection).
 * Returns null when the code is invalid.
 */
export function verifyTotpTimestep(code: string, secret: string): number | null {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const delta = authenticator.checkDelta(normalized, secret);
  if (delta === null || delta === undefined) return null;
  const step = authenticator.options.step ?? 30;
  const current = Math.floor(Date.now() / 1000 / step);
  return current + delta;
}

export function deriveKey(keyMaterial: string): Buffer {
  return createHash('sha256').update(keyMaterial, 'utf8').digest();
}
