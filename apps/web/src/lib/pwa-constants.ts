/** Every API cache name starts with this, so logging in or out can drop them all. */
export const API_CACHE = 'skladnik-api';

export const API_CACHES = {
  sites: `${API_CACHE}-sites`,
  products: `${API_CACHE}-products`,
  stock: `${API_CACHE}-stock`,
  documents: `${API_CACHE}-documents`,
  document: `${API_CACHE}-document`,
} as const;

/** How many of the newest documents the offline copy of the documents list keeps. */
export const OFFLINE_DOCUMENTS_KEPT = 50;
/** How many opened documents stay readable offline. */
export const OFFLINE_DOCUMENT_DETAILS_KEPT = 20;
/** Cached data older than this is marked as a saved copy on screen. */
export const FRESH_DATA_MS = 5 * 60 * 1000;

export const API_PATH_PREFIXES = [
  'auth',
  'platform-auth',
  'subscriptions',
  'tenancy',
  'sites',
  'users',
  'invites',
  'product-groups',
  'partners',
  'products',
  'unit-aliases',
  'documents',
  'stock',
  'sales',
  'recipes',
  'reports',
  'vat',
  'export-profiles',
  'company',
  'activity',
  'annex38',
  'health',
] as const;

/**
 * Multi-segment API mounts that must not steal the `/platform` SPA routes
 * (`/platform/login`, `/platform/subscriptions` UI, …).
 */
export const API_NESTED_PATH_PREFIXES = ['platform/subscriptions'] as const;
