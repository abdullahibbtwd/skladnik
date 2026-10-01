/**
 * ACC-01 / ACC-02: Accountant is deny-by-default on every mutating HTTP method.
 * Only the explicit allow-list below may change state (exports, VAT/Annex 38 files, own layouts).
 * Separation of duties ("втори човек за осчетоводяване") — skipped (product decision: no setting).
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Path patterns (Express-style :param) that an Accountant may POST/PUT/PATCH/DELETE. */
const ALLOWED: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  // Saved report column layouts (own company preference).
  { method: 'POST', pattern: /^\/export-profiles\/?$/ },
  { method: 'PUT', pattern: /^\/export-profiles\/[^/]+\/?$/ },
  { method: 'DELETE', pattern: /^\/export-profiles\/[^/]+\/?$/ },
  // VAT return: period inputs + DEKLAR/POKUPKI/PRODAGBI generation + mark submitted.
  { method: 'PUT', pattern: /^\/vat\/periods\/[^/]+\/inputs\/?$/ },
  { method: 'POST', pattern: /^\/vat\/periods\/[^/]+\/filings\/?$/ },
  { method: 'POST', pattern: /^\/vat\/filings\/[^/]+\/submitted\/?$/ },
  // Annex 38 generation + mark submitted (archive of generated files).
  { method: 'POST', pattern: /^\/annex38\/sites\/[^/]+\/periods\/[^/]+\/filings\/?$/ },
  { method: 'POST', pattern: /^\/annex38\/filings\/[^/]+\/submitted\/?$/ },
];

export function isSafeHttpMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/** Strip query string and trailing slash for matching. */
export function normalizeRequestPath(url: string): string {
  const path = (url.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function isAccountantMutationAllowed(method: string, url: string): boolean {
  if (isSafeHttpMethod(method)) return true;
  const path = normalizeRequestPath(url);
  const verb = method.toUpperCase();
  return ALLOWED.some((rule) => rule.method === verb && rule.pattern.test(path));
}
