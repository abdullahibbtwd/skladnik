import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import i18n from '../i18n';
import { toast } from '../components/ui/Toaster';
import { API_CACHE, API_CACHES } from './pwa-constants';
import { queryClient } from './query-client';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function registerServiceWorker() {
  watchCacheUpdates();
  let prompted = false;
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      if (prompted) return;
      prompted = true;
      toast.info(i18n.t('pwa.update.title'), i18n.t('pwa.update.body'), {
        sticky: true,
        action: { label: i18n.t('pwa.update.reload'), onClick: () => void updateServiceWorker(true) },
      });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => undefined);
      }, UPDATE_CHECK_MS);
    },
  });
}

/** API responses belong to the signed-in user; drop them whenever the user changes. */
export function clearApiCache() {
  if (!('caches' in window)) return;
  void caches
    .keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(API_CACHE)).map((key) => caches.delete(key))))
    .catch(() => undefined);
}

/** The product list is served from the offline copy first; when the background refresh brings a change, reload it. */
function watchCacheUpdates() {
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<{ type?: string; payload?: { cacheName?: string } }>) => {
    if (event.data?.type === 'CACHE_UPDATED' && event.data.payload?.cacheName === API_CACHES.products) {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'products'] });
    }
  });
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export const useInstallStore = create<{ event: BeforeInstallPromptEvent | null }>(() => ({ event: null }));

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  useInstallStore.setState({ event: event as BeforeInstallPromptEvent });
});

window.addEventListener('appinstalled', () => {
  useInstallStore.setState({ event: null });
});
