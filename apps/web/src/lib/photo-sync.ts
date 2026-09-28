import { deletePhoto, emitQueueEvent, listPhotos, updatePhoto, type PhotoQueueItem } from './photo-queue';

/** Shared by the page and the service worker: no DOM-only APIs and no React in this module. */

export const MAX_UPLOAD_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 30_000;
const PING_TIMEOUT_MS = 4_000;
/** An upload marked "uploading" for longer than this was cut off (tab closed, worker stopped). */
const STALE_UPLOAD_MS = 2 * 60_000;

export type SyncOutcome = {
  uploaded: { id: string; documentId: string | null }[];
  /** The API couldn't be reached; photos stay queued without using up an attempt. */
  unreachable: boolean;
  needsSignIn: boolean;
  /** Another tab or the service worker is already uploading. */
  busy: boolean;
  /** Earliest time a queued photo is due for its next attempt, or null when nothing is waiting. */
  nextAttemptAt: number | null;
};

type SyncOptions = {
  userId: string;
  /** Renews the access cookie after a 401; resolves false when the session is gone. */
  refresh: () => Promise<boolean>;
  bySw?: boolean;
};

/** 30 s, 2 min, 8 min. */
export function backoffDelay(retryCount: number) {
  return BACKOFF_BASE_MS * 4 ** Math.max(0, retryCount - 1);
}

export function isTransientStatus(status: number) {
  return status >= 500 || status === 408 || status === 429;
}

/** navigator.onLine only says a network exists; this proves the API answers. */
export async function pingApi(timeoutMs = PING_TIMEOUT_MS) {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/health/live', { cache: 'no-store', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function uploadQueuedPhoto(item: PhotoQueueItem) {
  const body = new FormData();
  body.append('clientRequestId', item.id);
  body.append('siteId', item.siteId);
  body.append('type', item.documentType);
  body.append('issuedOn', item.metadata.issuedOn);
  body.append('capturedAt', new Date(item.createdAt).toISOString());
  body.append('file', item.blob, item.metadata.fileName);
  return fetch('/documents/scan', { method: 'POST', body, credentials: 'include' });
}

async function responseMessage(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((part) => typeof part === 'string').join('. ');
  }
  return `HTTP ${response.status}`;
}

async function documentId(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  const document = payload && typeof payload === 'object' && 'document' in payload ? (payload as { document: { id?: unknown } }).document : null;
  return typeof document?.id === 'string' ? document.id : null;
}

async function nextDue(userId: string) {
  const waiting = (await listPhotos(userId)).filter((item) => item.status === 'queued' && item.errorKind !== 'signed-out');
  return waiting.length ? Math.min(...waiting.map((item) => item.nextAttemptAt)) : null;
}

async function runSync({ userId, refresh, bySw = false }: SyncOptions): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { uploaded: [], unreachable: false, needsSignIn: false, busy: false, nextAttemptAt: null };
  const now = Date.now();
  const items = await listPhotos(userId);
  for (const item of items) {
    if (item.status === 'uploading' && now - item.updatedAt > STALE_UPLOAD_MS) await updatePhoto(item.id, { status: 'queued' });
  }

  const due = (await listPhotos(userId)).filter((item) => item.status === 'queued' && item.nextAttemptAt <= now);
  if (due.length === 0) return { ...outcome, nextAttemptAt: await nextDue(userId) };
  if (!(await pingApi())) return { ...outcome, unreachable: true, nextAttemptAt: await nextDue(userId) };

  let refreshed = false;
  for (const item of due) {
    await updatePhoto(item.id, { status: 'uploading' });
    let response: Response;
    try {
      response = await uploadQueuedPhoto(item);
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        if (await refresh()) response = await uploadQueuedPhoto(item);
      }
    } catch {
      await updatePhoto(item.id, { status: 'queued' });
      outcome.unreachable = true;
      break;
    }

    if (response.ok) {
      const id = await documentId(response);
      await deletePhoto(item.id);
      outcome.uploaded.push({ id: item.id, documentId: id });
      emitQueueEvent({ type: 'uploaded', id: item.id, userId, documentId: id, bySw });
      continue;
    }

    const message = await responseMessage(response);
    if (response.status === 401) {
      await updatePhoto(item.id, { status: 'queued', lastError: message, errorKind: 'signed-out' });
      outcome.needsSignIn = true;
      break;
    }
    const retryCount = item.retryCount + 1;
    if (isTransientStatus(response.status) && retryCount < MAX_UPLOAD_ATTEMPTS) {
      await updatePhoto(item.id, { status: 'queued', retryCount, nextAttemptAt: Date.now() + backoffDelay(retryCount), lastError: message, errorKind: 'server' });
      continue;
    }
    await updatePhoto(item.id, {
      status: 'failed',
      retryCount,
      lastError: message,
      errorKind: isTransientStatus(response.status) ? 'server' : 'rejected',
    });
  }

  return { ...outcome, nextAttemptAt: await nextDue(userId) };
}

let runningHere = false;

/** One uploader at a time across tabs and the service worker (Web Locks), so a photo is never sent twice at once. */
export async function syncPhotoQueue(options: SyncOptions): Promise<SyncOutcome> {
  const busy: SyncOutcome = { uploaded: [], unreachable: false, needsSignIn: false, busy: true, nextAttemptAt: null };
  if ('locks' in navigator && navigator.locks) {
    const result = await navigator.locks.request('skladnik-photo-sync', { ifAvailable: true }, (lock) => (lock ? runSync(options) : null));
    return result ?? busy;
  }
  if (runningHere) return busy;
  runningHere = true;
  try {
    return await runSync(options);
  } finally {
    runningHere = false;
  }
}
