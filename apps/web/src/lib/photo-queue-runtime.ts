import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { PaperDocumentType } from '@skladnik/shared';
import i18n from '../i18n';
import { toast } from '../components/ui/Toaster';
import { refreshSession } from './auth-api';
import { startConnectivityWatch, useConnectivity } from './connectivity';
import {
  PHOTO_SYNC_MESSAGE,
  PHOTO_SYNC_TAG,
  deletePhoto,
  enqueuePhoto,
  listPhotos,
  retryPhoto,
  subscribeQueue,
  type PhotoQueueItem,
} from './photo-queue';
import { syncPhotoQueue } from './photo-sync';

const SYNC_INTERVAL_MS = 60_000;

type QueueState = { userId: string | null; items: PhotoQueueItem[]; syncing: boolean };

export const usePhotoQueue = create<QueueState>(() => ({ userId: null, items: [], syncing: false }));

/** Photos still on their way (including ones waiting for the user to sign in again). */
export const isWaiting = (item: PhotoQueueItem) => item.status !== 'failed';

export function usePhotoQueueCounts() {
  const items = usePhotoQueue((state) => state.items);
  const waiting = items.filter(isWaiting).length;
  return { waiting, failed: items.length - waiting, total: items.length };
}

async function reload(userId: string) {
  const items = await listPhotos(userId).catch(() => []);
  if (usePhotoQueue.getState().userId === userId) usePhotoQueue.setState({ items });
}

type SyncCapableRegistration = ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };

/** Background Sync (Chrome, Edge, Android) uploads even after the tab is closed; elsewhere the page syncs on reconnect and focus. */
export async function requestBackgroundSync() {
  try {
    const registration = (await navigator.serviceWorker?.getRegistration()) as SyncCapableRegistration | undefined;
    if (!registration?.sync) return false;
    await registration.sync.register(PHOTO_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

let retryTimer: number | undefined;

export async function syncPhotosNow(userId: string) {
  usePhotoQueue.setState({ syncing: true });
  try {
    const outcome = await syncPhotoQueue({ userId, refresh: refreshSession });
    if (outcome.unreachable) {
      useConnectivity.setState({ reachable: false });
      void requestBackgroundSync();
    } else if (outcome.uploaded.length > 0) {
      useConnectivity.setState({ reachable: true });
    }
    window.clearTimeout(retryTimer);
    if (outcome.nextAttemptAt !== null && !outcome.unreachable) {
      retryTimer = window.setTimeout(() => void syncPhotosNow(userId), Math.max(1_000, outcome.nextAttemptAt - Date.now()));
    }
    return outcome;
  } catch {
    return null;
  } finally {
    usePhotoQueue.setState({ syncing: false });
    void reload(userId);
  }
}

export async function queuePhoto(input: {
  id: string;
  user: { id: string; companyId: string };
  site: { id: string; name: string };
  documentType: PaperDocumentType;
  issuedOn: string;
  capturedAt: Date;
  file: File;
}) {
  await enqueuePhoto({
    id: input.id,
    siteId: input.site.id,
    documentType: input.documentType,
    blob: input.file,
    metadata: {
      userId: input.user.id,
      companyId: input.user.companyId,
      siteName: input.site.name,
      issuedOn: input.issuedOn,
      fileName: input.file.name || 'photo.jpg',
    },
    createdAt: input.capturedAt.getTime(),
  });
  void navigator.storage?.persist?.().catch(() => false);
  void requestBackgroundSync();
}

export async function retryQueuedPhoto(id: string, userId: string) {
  await retryPhoto(id);
  void requestBackgroundSync();
  void syncPhotosNow(userId);
}

export function discardQueuedPhoto(id: string) {
  return deletePhoto(id);
}

export function isQuotaError(error: unknown) {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
}

/** Keeps the queue store current and uploads queued photos whenever the API is reachable. */
export function usePhotoQueueRuntime(userId: string | undefined) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const queryClient = useQueryClient();

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    startConnectivityWatch();
    usePhotoQueue.setState({ userId, items: [] });
    void reload(userId);

    const run = () => void syncPhotosNow(userId);
    const unsubscribeQueue = subscribeQueue((event, local) => {
      if (event.type === 'uploaded' && event.userId === userId) {
        void queryClient.invalidateQueries({ queryKey: ['workspace', 'documents'] });
        const show = event.bySw ? document.visibilityState === 'visible' : local;
        if (show) {
          const documentId = event.documentId;
          toast.success(i18n.t('photoQueue.uploadedTitle'), i18n.t('photoQueue.uploadedBody'), documentId
            ? { action: { label: i18n.t('photoQueue.open'), onClick: () => navigateRef.current(`/app/invoices/${documentId}`) } }
            : undefined);
        }
      }
      void reload(userId);
    });
    const unsubscribeConnectivity = useConnectivity.subscribe((state, previous) => {
      if (state.reachable && !previous.reachable) {
        run();
        void queryClient.refetchQueries({ type: 'active' });
      }
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    const onWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === PHOTO_SYNC_MESSAGE) run();
    };
    window.addEventListener('online', run);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    const interval = window.setInterval(() => {
      if (usePhotoQueue.getState().items.some(isWaiting)) run();
    }, SYNC_INTERVAL_MS);
    run();

    return () => {
      unsubscribeQueue();
      unsubscribeConnectivity();
      window.removeEventListener('online', run);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
      window.clearInterval(interval);
      window.clearTimeout(retryTimer);
      usePhotoQueue.setState({ userId: null, items: [] });
    };
  }, [userId, queryClient]);
}
