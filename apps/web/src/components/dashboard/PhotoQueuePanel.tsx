import React, { useEffect, useState } from 'react';
import { CloudUpload, ImageOff, RotateCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRequiredUser } from '../../lib/auth-store';
import { formatBusinessDateTime, formatBusinessTime } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { checkConnectivity, useConnectivity } from '../../lib/connectivity';
import type { PhotoQueueItem } from '../../lib/photo-queue';
import { discardQueuedPhoto, retryQueuedPhoto, syncPhotosNow, usePhotoQueue, usePhotoQueueCounts } from '../../lib/photo-queue-runtime';
import { MAX_UPLOAD_ATTEMPTS } from '../../lib/photo-sync';
import { confirm } from '../ui/Dialog';
import { ActionButton, GhostButton, GlassPanel, PageHeader } from './dashboard-ui';

function useObjectUrl(blob: Blob) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

type Tone = 'accent' | 'warn' | 'danger' | 'muted';

const TONE: Record<Tone, string> = {
  accent: 'border-ops-accent/20 bg-indigo-50 text-ops-accent',
  warn: 'border-ops-warn/25 bg-orange-50 text-ops-warn',
  danger: 'border-ops-danger/20 bg-rose-50 text-ops-danger',
  muted: 'border-slate-200 bg-slate-50 text-slate-500',
};

function useItemStatus(item: PhotoQueueItem, reachable: boolean): { label: string; tone: Tone; detail: string | null } {
  const { t, i18n } = useTranslation();
  if (item.status === 'uploading') return { label: t('photoQueue.status.uploading'), tone: 'accent', detail: null };
  if (item.status === 'failed') {
    return {
      label: t('photoQueue.status.failed'),
      tone: 'danger',
      detail: item.errorKind === 'server' ? t('photoQueue.status.gaveUp', { count: MAX_UPLOAD_ATTEMPTS, error: item.lastError ?? '' }) : item.lastError,
    };
  }
  if (item.errorKind === 'signed-out') return { label: t('photoQueue.status.signIn'), tone: 'warn', detail: t('photoQueue.status.signInHint') };
  if (item.retryCount > 0 && item.nextAttemptAt > Date.now()) {
    return {
      label: t('photoQueue.status.retrying', { time: formatBusinessTime(new Date(item.nextAttemptAt).toISOString(), i18n.language) }),
      tone: 'warn',
      detail: t('photoQueue.status.attempt', { attempt: item.retryCount, max: MAX_UPLOAD_ATTEMPTS, error: item.lastError ?? '' }),
    };
  }
  return reachable ? { label: t('photoQueue.status.waiting'), tone: 'accent', detail: null } : { label: t('photoQueue.status.offline'), tone: 'muted', detail: null };
}

const QueueRow: React.FC<{ item: PhotoQueueItem; reachable: boolean; userId: string }> = ({ item, reachable, userId }) => {
  const { t, i18n } = useTranslation();
  const url = useObjectUrl(item.blob);
  const [broken, setBroken] = useState(false);
  const status = useItemStatus(item, reachable);
  const canRetry = item.status === 'failed' || item.errorKind === 'signed-out' || item.nextAttemptAt > Date.now();

  const discard = async () => {
    const ok = await confirm({ title: t('photoQueue.discardTitle'), description: t('photoQueue.discardBody'), confirmLabel: t('photoQueue.discard'), danger: true });
    if (ok) await discardQueuedPhoto(item.id);
  };

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid="photo-queue-item">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-ops-canvas">
        {broken || item.blob.type === 'application/pdf' ? (
          <ImageOff size={18} className="text-slate-400" />
        ) : (
          url && <img src={url} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-[0.86rem] font-medium text-ops-ink">{item.metadata.siteName}</p>
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 font-display text-[0.66rem] font-medium', TONE[status.tone])}>
            {item.status === 'uploading' && <span className="mr-1 size-2.5 animate-spin rounded-full border border-current border-t-transparent" />}
            {status.label}
          </span>
        </div>
        <p className="mt-0.5 font-sans text-[0.74rem] text-slate-500">
          {t(`labels.documentType.${item.documentType}`)} · {formatBusinessDateTime(new Date(item.createdAt).toISOString(), i18n.language)}
        </p>
        {status.detail && <p className="mt-1 font-sans text-[0.74rem] break-words text-slate-600">{status.detail}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        {canRetry && item.status !== 'uploading' && (
          <GhostButton onClick={() => void retryQueuedPhoto(item.id, userId)}>
            <span className="inline-flex items-center gap-1">
              <RotateCw size={12} />
              {t('photoQueue.retry')}
            </span>
          </GhostButton>
        )}
        <GhostButton danger onClick={() => void discard()} disabled={item.status === 'uploading'}>
          <span className="inline-flex items-center gap-1">
            <Trash2 size={12} />
            {t('photoQueue.discard')}
          </span>
        </GhostButton>
      </div>
    </li>
  );
};

/** Photos taken while offline (or while the server was failing), waiting to become draft documents. */
export const PhotoQueuePanel: React.FC = () => {
  const { t } = useTranslation();
  const user = useRequiredUser();
  const items = usePhotoQueue((state) => state.items);
  const syncing = usePhotoQueue((state) => state.syncing);
  const reachable = useConnectivity((state) => state.reachable);
  const { waiting, failed } = usePhotoQueueCounts();
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const uploadNow = async () => {
    if (!(await checkConnectivity())) return;
    await syncPhotosNow(user.id);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader
        title={t('photoQueue.title')}
        description={t('photoQueue.desc')}
        action={waiting > 0 ? <ActionButton primary icon={CloudUpload} label={t('photoQueue.uploadNow')} onClick={() => void uploadNow()} disabled={syncing} /> : undefined}
      />

      <GlassPanel
        title={t('photoQueue.summary', { waiting, failed })}
        action={
          waiting > 0 ? (
            <button
              type="button"
              onClick={() => void uploadNow()}
              disabled={syncing}
              className="font-display text-[0.78rem] font-medium text-ops-accent hover:underline disabled:opacity-50 lg:hidden"
            >
              {syncing ? t('photoQueue.status.uploading') : t('photoQueue.uploadNow')}
            </button>
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="photo-queue-empty">
            <CloudUpload size={26} className="text-slate-300" />
            <p className="font-display text-[0.9rem] font-medium text-ops-ink">{t('photoQueue.emptyTitle')}</p>
            <p className="max-w-sm font-sans text-[0.78rem] text-slate-500">{t('photoQueue.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <QueueRow key={item.id} item={item} reachable={reachable} userId={user.id} />
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
};
