import { createHmac, timingSafeEqual } from 'node:crypto';

export const MARKETING_UNSUB_PURPOSE = 'marketing-unsub' as const;

export type MarketingUnsubPayload = {
  userId: string;
  purpose: typeof MARKETING_UNSUB_PURPOSE;
};

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return b.toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/** Build a URL-safe HMAC token for marketing unsubscribe (no expiry). */
export function createMarketingUnsubscribeToken(userId: string, secret: string): string {
  if (!secret.trim()) {
    throw new Error('Marketing unsubscribe secret is not configured');
  }
  const payload: MarketingUnsubPayload = { userId, purpose: MARKETING_UNSUB_PURPOSE };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export type VerifyMarketingUnsubscribeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'tampered' | 'bad_purpose' };

/** Verify token; never throws — callers map to friendly errors. */
export function verifyMarketingUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
): VerifyMarketingUnsubscribeResult {
  if (!token || !secret.trim()) return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid' };
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false, reason: 'invalid' };

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'tampered' };
  }

  try {
    const json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as MarketingUnsubPayload;
    if (json.purpose !== MARKETING_UNSUB_PURPOSE || typeof json.userId !== 'string' || !json.userId) {
      return { ok: false, reason: 'bad_purpose' };
    }
    return { ok: true, userId: json.userId };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
