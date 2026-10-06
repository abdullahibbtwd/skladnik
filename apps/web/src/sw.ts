/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate, type Strategy } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BroadcastUpdatePlugin } from 'workbox-broadcast-update';
import type { RouteHandlerCallback, RouteMatchCallbackOptions, WorkboxPlugin } from 'workbox-core';
import { API_CACHE, API_CACHES, API_NESTED_PATH_PREFIXES, API_PATH_PREFIXES, OFFLINE_DOCUMENT_DETAILS_KEPT, OFFLINE_DOCUMENTS_KEPT } from './lib/pwa-constants';
import { PHOTO_SYNC_MESSAGE, PHOTO_SYNC_TAG } from './lib/photo-queue';
import { syncPhotoQueue } from './lib/photo-sync';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

type SyncEvent = ExtendableEvent & { readonly tag: string; readonly lastChance: boolean };

const apiPath = new RegExp(
  `^/(?:${[...API_PATH_PREFIXES, ...API_NESTED_PATH_PREFIXES.map((p) => p.replace(/\//g, '\\/'))].join('|')})(?:/|$)`,
);
/** File downloads and streams: large, sometimes signed and short-lived, so never cached. */
const filePath = /\/(?:export|archive|download|file|url)$/;
const isApi = (url: URL) => url.origin === self.location.origin && apiPath.test(url.pathname);

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [
    apiPath,
    // Platform operator UI must never be served from the offline SPA fallback cache.
    /^\/platform(?:\/|$)/,
  ],
}));

registerRoute(
  ({ url }) =>
    isApi(url) &&
    (/^\/(?:auth|health|platform-auth|subscriptions)(?:\/|$)/.test(url.pathname) ||
      /^\/platform\/subscriptions(?:\/|$)/.test(url.pathname)),
  new NetworkOnly(),
);
registerRoute(({ url }) => isApi(url) && filePath.test(url.pathname), new NetworkOnly());

/*
 * Offline reading. Copies are kept for days so the app still shows stock and recent documents
 * with no signal; the page marks anything older than FRESH_DATA_MS as a saved copy.
 */
const DAY_SECONDS = 24 * 60 * 60;
const NETWORK_TIMEOUT_SECONDS = 5;
const ok = new CacheableResponsePlugin({ statuses: [200] });
const onPath = (pattern: RegExp) => ({ url }: RouteMatchCallbackOptions) => url.origin === self.location.origin && pattern.test(url.pathname);

/** The page asks for a fresh copy (`cache: 'no-cache'`) when it refetches data it already shows: after a change, on focus, on reconnect. */
const wantsFresh = (request: Request) => request.cache === 'no-cache' || request.cache === 'reload';
const unlessFresh =
  (cached: Strategy, fresh: Strategy): RouteHandlerCallback =>
  (options) =>
    (wantsFresh(options.request) ? fresh : cached).handle(options);

/**
 * NetworkFirst only falls back when the request itself fails. With the API down behind a proxy the
 * answer is a 5xx instead (nginx 502), so use the saved copy for that too when there is one.
 */
const savedCopyOnServerError = (cacheName: string): WorkboxPlugin => ({
  handlerWillRespond: async ({ request, response }) => {
    if (response.status < 500) return response;
    return (await caches.match(request, { cacheName })) ?? response;
  },
});

/** The offline copy of the documents list keeps only the newest documents (the API sorts newest first). */
const keepNewestDocuments: WorkboxPlugin = {
  cacheWillUpdate: async ({ response }) => {
    const payload = (await response.clone().json().catch(() => null)) as { documents?: unknown[] } | null;
    if (!Array.isArray(payload?.documents) || payload.documents.length <= OFFLINE_DOCUMENTS_KEPT) return response;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    return new Response(JSON.stringify({ ...payload, documents: payload.documents.slice(0, OFFLINE_DOCUMENTS_KEPT) }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

const sitesPlugins = [ok, savedCopyOnServerError(API_CACHES.sites), new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 30 * DAY_SECONDS, purgeOnQuotaError: true })];
registerRoute(
  onPath(/^\/sites$/),
  unlessFresh(
    new CacheFirst({ cacheName: API_CACHES.sites, plugins: sitesPlugins }),
    new NetworkFirst({ cacheName: API_CACHES.sites, networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS, plugins: sitesPlugins }),
  ),
);

const productsPlugins = [ok, savedCopyOnServerError(API_CACHES.products), new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * DAY_SECONDS, purgeOnQuotaError: true })];
registerRoute(
  onPath(/^\/products$/),
  unlessFresh(
    new StaleWhileRevalidate({ cacheName: API_CACHES.products, plugins: [...productsPlugins, new BroadcastUpdatePlugin()] }),
    new NetworkFirst({ cacheName: API_CACHES.products, networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS, plugins: productsPlugins }),
  ),
);

registerRoute(
  onPath(/^\/stock$/),
  new NetworkFirst({
    cacheName: API_CACHES.stock,
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [ok, savedCopyOnServerError(API_CACHES.stock), new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * DAY_SECONDS, purgeOnQuotaError: true })],
  }),
);

registerRoute(
  onPath(/^\/documents$/),
  new NetworkFirst({
    cacheName: API_CACHES.documents,
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [ok, keepNewestDocuments, savedCopyOnServerError(API_CACHES.documents), new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 7 * DAY_SECONDS, purgeOnQuotaError: true })],
  }),
);

const documentPlugins = [ok, savedCopyOnServerError(API_CACHES.document), new ExpirationPlugin({ maxEntries: OFFLINE_DOCUMENT_DETAILS_KEPT, maxAgeSeconds: 30 * DAY_SECONDS, purgeOnQuotaError: true })];
registerRoute(
  onPath(/^\/documents\/[0-9a-f-]{36}$/i),
  unlessFresh(
    new NetworkFirst({ cacheName: API_CACHES.document, networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS, plugins: documentPlugins }),
    // A refetch (e.g. polling while a photo is read) waits for the server, however slow: a saved copy
    // would freeze the screen on "reading". It still falls back to the copy when the request fails.
    new NetworkFirst({ cacheName: API_CACHES.document, plugins: documentPlugins }),
  ),
);

registerRoute(
  ({ url }) => isApi(url),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 5 * 60, maxEntries: 300 }), new CacheableResponsePlugin({ statuses: [200] })],
  }),
);
registerRoute(
  ({ url }) => /^fonts\.(?:googleapis|gstatic)\.com$/.test(url.hostname),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 60 * 60, maxEntries: 30 }), new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

async function askPagesToSync() {
  const windows = await self.clients.matchAll({ type: 'window' });
  for (const client of windows) client.postMessage({ type: PHOTO_SYNC_MESSAGE });
}

async function refreshSession() {
  const response = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
  return response.ok;
}

async function currentUserId(canRefresh: boolean): Promise<string | null> {
  const me = () => fetch('/auth/me', { credentials: 'include' });
  let response = await me();
  if (response.status === 401 && canRefresh && (await refreshSession())) response = await me();
  if (!response.ok) return null;
  const payload = (await response.json()) as { user?: { id?: string } };
  return payload.user?.id ?? null;
}

/**
 * Refresh tokens are single-use: if the worker and an open page both refreshed at once, the page
 * would lose its session. So the worker only refreshes when no page is open; otherwise it hands
 * the job to the page, which refreshes through its own single-flight path.
 */
async function backgroundSync(lastChance: boolean) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const canRefresh = windows.length === 0;
  const userId = await currentUserId(canRefresh);
  if (!userId) {
    await askPagesToSync();
    return;
  }
  const outcome = await syncPhotoQueue({
    userId,
    bySw: true,
    refresh: async () => {
      if (canRefresh) return refreshSession();
      await askPagesToSync();
      return false;
    },
  });
  const waiting = outcome.unreachable || (outcome.nextAttemptAt !== null && !outcome.needsSignIn);
  if (waiting && !lastChance) throw new Error('Queued photos will be retried');
}

self.addEventListener('sync', (event) => {
  const sync = event as SyncEvent;
  if (sync.tag === PHOTO_SYNC_TAG) sync.waitUntil(backgroundSync(sync.lastChance));
});
