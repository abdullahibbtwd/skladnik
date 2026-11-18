type AnalyticsProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;
    umami?: { track: (event: string, data?: Record<string, string | number | boolean>) => void };
  }
}

function cleanProps(props?: AnalyticsProps): Record<string, string | number | boolean> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Fire a custom event when Umami or Plausible is loaded; no-op otherwise. */
export function trackEvent(name: string, props?: AnalyticsProps) {
  if (typeof window === 'undefined') return;
  const cleaned = cleanProps(props);
  try {
    if (typeof window.plausible === 'function') {
      window.plausible(name, cleaned ? { props: cleaned } : undefined);
      return;
    }
    if (typeof window.umami?.track === 'function') {
      window.umami.track(name, cleaned);
    }
  } catch {
    // analytics must never break the app
  }
}

/**
 * Load a cookieless analytics script when env is set.
 * - Plausible: VITE_ANALYTICS_SCRIPT_URL=https://plausible.io/js/script.js
 *              VITE_ANALYTICS_WEBSITE_ID=oborotix.com  (data-domain)
 * - Umami:     VITE_ANALYTICS_SCRIPT_URL=https://cloud.umami.is/script.js
 *              VITE_ANALYTICS_WEBSITE_ID=<website-uuid> (data-website-id)
 */
export function initAnalytics() {
  const scriptUrl = import.meta.env.VITE_ANALYTICS_SCRIPT_URL?.trim();
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID?.trim();
  if (!scriptUrl || !websiteId || typeof document === 'undefined') return;
  if (document.querySelector(`script[data-oborotix-analytics="1"]`)) return;

  const script = document.createElement('script');
  script.defer = true;
  script.src = scriptUrl;
  script.dataset.oborotixAnalytics = '1';
  const isUmami = /umami/i.test(scriptUrl);
  if (isUmami) {
    script.dataset.websiteId = websiteId;
  } else {
    script.dataset.domain = websiteId;
  }
  document.head.appendChild(script);
}
