import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PaperDocumentType } from '@skladnik/shared';

/** Shared by the page and the service worker: no DOM-only APIs and no React in this module. */

export const PHOTO_SYNC_TAG = 'uploadPhotos';
export const PHOTO_SYNC_MESSAGE = 'photo-queue:sync';

export type PhotoQueueStatus = 'queued' | 'uploading' | 'failed';

/** `signed-out`: waits for the user to sign in again. `rejected`: the server refused it; retrying won't help without a change. */
export type PhotoQueueErrorKind = 'server' | 'rejected' | 'signed-out';

export type PhotoQueueItem = {
  /** Also sent as the scan's clientRequestId, so a repeated upload never creates a second document. */
  id: string;
  siteId: string;
  documentType: PaperDocumentType;
  blob: Blob;
  metadata: {
    userId: string;
    companyId: string;
    siteName: string;
    /** Business day (Europe/Sofia) when the photo was taken. */
    issuedOn: string;
    fileName: string;
  };
  status: PhotoQueueStatus;
  /** Failed attempts that reached the server; being offline doesn't count. */
  retryCount: number;
  createdAt: number;
  nextAttemptAt: number;
  updatedAt: number;
  lastError: string | null;
  errorKind: PhotoQueueErrorKind | null;
};

export type PhotoQueueEvent =
  | { type: 'changed' }
  | { type: 'uploaded'; id: string; userId: string; documentId: string | null; bySw: boolean };

interface OfflineDb extends DBSchema {
  photoQueue: {
    key: string;
    value: PhotoQueueItem;
    indexes: { byUser: string };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null;

function db() {
  dbPromise ??= openDB<OfflineDb>('skladnik-offline', 1, {
    upgrade(database) {
      const store = database.createObjectStore('photoQueue', { keyPath: 'id' });
      store.createIndex('byUser', 'metadata.userId');
    },
  });
  return dbPromise;
}

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('skladnik-photo-queue');
/** `local` is true when the event came from this tab (or worker) rather than another one. */
type QueueListener = (event: PhotoQueueEvent, local: boolean) => void;

const listeners = new Set<QueueListener>();

channel?.addEventListener('message', (message: MessageEvent<PhotoQueueEvent>) => {
  for (const listener of listeners) listener(message.data, false);
});

/** BroadcastChannel skips the sender, so local listeners are called directly as well. */
export function emitQueueEvent(event: PhotoQueueEvent) {
  for (const listener of listeners) listener(event, true);
  channel?.postMessage(event);
}

export function subscribeQueue(listener: QueueListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** crypto.randomUUID only exists on https / localhost; the queue also has to work on a plain-http LAN address. */
export function newQueueId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function enqueuePhoto(item: Omit<PhotoQueueItem, 'status' | 'retryCount' | 'nextAttemptAt' | 'updatedAt' | 'lastError' | 'errorKind'>) {
  await (await db()).put('photoQueue', {
    ...item,
    status: 'queued',
    retryCount: 0,
    nextAttemptAt: 0,
    updatedAt: Date.now(),
    lastError: null,
    errorKind: null,
  });
  emitQueueEvent({ type: 'changed' });
}

export async function listPhotos(userId: string) {
  const items = await (await db()).getAllFromIndex('photoQueue', 'byUser', userId);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPhoto(id: string) {
  return (await db()).get('photoQueue', id);
}

export async function updatePhoto(id: string, patch: Partial<Omit<PhotoQueueItem, 'id'>>) {
  const database = await db();
  const tx = database.transaction('photoQueue', 'readwrite');
  const current = await tx.store.get(id);
  if (current) await tx.store.put({ ...current, ...patch, updatedAt: Date.now() });
  await tx.done;
  if (current) emitQueueEvent({ type: 'changed' });
  return Boolean(current);
}

export async function deletePhoto(id: string) {
  await (await db()).delete('photoQueue', id);
  emitQueueEvent({ type: 'changed' });
}

/** Put a failed or signed-out photo back in line for an immediate attempt. */
export function retryPhoto(id: string) {
  return updatePhoto(id, { status: 'queued', retryCount: 0, nextAttemptAt: 0, lastError: null, errorKind: null });
}
