import { getAttribution } from './attribution';

export type QuoteRequestPayload = {
  name: string;
  businessType: string;
  locations: number;
  contact: string;
  message?: string;
  locale?: string;
  website?: string;
};

export async function submitQuoteRequest(input: QuoteRequestPayload): Promise<{ ok: true }> {
  const attribution = getAttribution();
  const response = await fetch('/public/quote-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      referrer: attribution.referrer,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message.filter((item: unknown) => typeof item === 'string').join('. ')
          : String(payload.message)
        : 'Could not send your request. Please try again.';
    throw new Error(message || 'Could not send your request. Please try again.');
  }
  return { ok: true };
}
