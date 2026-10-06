import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { deriveKey } from '../platform-auth/totp.crypto';

const DEFAULT_KID = 'v1';

/**
 * AES-256-GCM encrypt activation plaintext.
 * AAD must be ActivationCode.id. Wire format: `kid:iv:tag:ct` (base64url parts).
 */
export function encryptActivationCode(
  plaintext: string,
  keyMaterial: string,
  activationCodeId: string,
  kid = DEFAULT_KID,
): string {
  if (!activationCodeId) throw new Error('activationCodeId (AAD) is required');
  const key = deriveKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(activationCodeId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    kid,
    toB64url(iv),
    toB64url(tag),
    toB64url(ciphertext),
  ].join(':');
}

export function decryptActivationCode(
  payload: string,
  keyMaterial: string,
  activationCodeId: string,
): string {
  if (!activationCodeId) throw new Error('activationCodeId (AAD) is required');
  const parts = payload.split(':');
  if (parts.length !== 4) throw new Error('Invalid activation code ciphertext');
  const [, ivB64, tagB64, ctB64] = parts;
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Invalid activation code ciphertext');

  const key = deriveKey(keyMaterial);
  const decipher = createDecipheriv('aes-256-gcm', key, fromB64url(ivB64));
  decipher.setAAD(Buffer.from(activationCodeId, 'utf8'));
  decipher.setAuthTag(fromB64url(tagB64));
  return Buffer.concat([decipher.update(fromB64url(ctB64)), decipher.final()]).toString('utf8');
}

function toB64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
