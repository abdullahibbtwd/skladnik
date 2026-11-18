/**
 * Mirrors apps/web first-touch attribution rules (keep in sync with attribution.ts).
 */
import assert from 'node:assert/strict';

type Attribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
};

function pick(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value.slice(0, 200) : undefined;
}

function buildFirstTouchAttribution(
  search: string,
  referrer: string,
  existing: Attribution = {},
): Attribution {
  if (existing.utmSource || existing.utmMedium || existing.utmCampaign || existing.referrer) {
    return existing;
  }
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    utmSource: pick(params, 'utm_source'),
    utmMedium: pick(params, 'utm_medium'),
    utmCampaign: pick(params, 'utm_campaign'),
    referrer: referrer?.trim() ? referrer.trim().slice(0, 500) : undefined,
  };
}

{
  const a = buildFirstTouchAttribution(
    '?utm_source=google&utm_medium=cpc&utm_campaign=spring',
    'https://news.example/article',
  );
  assert.deepEqual(a, {
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'spring',
    referrer: 'https://news.example/article',
  });
}

{
  const existing = { utmSource: 'kept' };
  const a = buildFirstTouchAttribution('?utm_source=new', 'https://other', existing);
  assert.equal(a, existing);
}

{
  const a = buildFirstTouchAttribution('?utm_source=' + 'z'.repeat(250), '');
  assert.equal(a.utmSource?.length, 200);
}

console.log('attribution-parse.test.ts: ok');
