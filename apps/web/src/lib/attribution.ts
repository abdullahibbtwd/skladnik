const STORAGE_KEY = 'oborotix.attribution';

export type Attribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
};

function readStored(): Attribution {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Attribution;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(value: Attribution) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

function pick(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value.slice(0, 200) : undefined;
}

/** Pure first-touch merge: keep existing session values; otherwise take UTM + referrer. */
export function buildFirstTouchAttribution(
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

/** Capture first-touch UTM + referrer once per browser tab session. */
export function captureAttributionFromLocation(
  search = typeof window !== 'undefined' ? window.location.search : '',
  referrer = typeof document !== 'undefined' ? document.referrer : '',
): Attribution {
  const existing = readStored();
  const next = buildFirstTouchAttribution(search, referrer, existing);
  if (
    next !== existing &&
    (next.utmSource || next.utmMedium || next.utmCampaign || next.referrer)
  ) {
    writeStored(next);
  }
  return next;
}

export function getAttribution(): Attribution {
  return readStored();
}
