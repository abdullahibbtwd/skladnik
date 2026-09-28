import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, TriangleAlert, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { useConnectivity } from '../../lib/connectivity';
import { usePhotoQueueCounts } from '../../lib/photo-queue-runtime';

/** Header indicator: offline state and photos still waiting to upload; opens the queue. */
export const PhotoQueueBadge: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reachable = useConnectivity((state) => state.reachable);
  const { waiting, failed } = usePhotoQueueCounts();

  if (reachable && waiting === 0 && failed === 0) return null;

  const label =
    waiting > 0 ? t('photoQueue.badgeWaiting', { count: waiting }) : failed > 0 ? t('photoQueue.badgeFailed', { count: failed }) : t('photoQueue.offline');
  const Icon = failed > 0 && waiting === 0 ? TriangleAlert : !reachable ? WifiOff : CloudUpload;

  return (
    <button
      type="button"
      onClick={() => navigate('/app/photo-queue')}
      title={!reachable ? t('photoQueue.offlineHint') : label}
      data-testid="photo-queue-badge"
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-display text-[0.74rem] font-medium shadow-sm transition-all active:scale-95',
        failed > 0 && waiting === 0
          ? 'border-ops-danger/25 bg-rose-50 text-ops-danger hover:bg-rose-100'
          : !reachable
            ? 'border-ops-warn/30 bg-orange-50 text-ops-warn hover:bg-orange-100'
            : 'border-ops-accent/25 bg-indigo-50 text-ops-accent hover:bg-indigo-100',
      )}
    >
      <Icon size={15} strokeWidth={2.1} />
      <span className="hidden sm:inline">{label}</span>
      {(waiting > 0 || failed > 0) && <span className="font-mono tabular-nums sm:hidden">{waiting || failed}</span>}
      {!reachable && waiting > 0 && <span className="hidden rounded-full bg-ops-warn/15 px-1.5 text-[0.66rem] text-ops-warn md:inline">{t('photoQueue.offline')}</span>}
      {waiting > 0 && failed > 0 && (
        <span className="hidden rounded-full bg-ops-danger/10 px-1.5 text-[0.66rem] text-ops-danger md:inline">{t('photoQueue.failedShort', { count: failed })}</span>
      )}
    </button>
  );
};
