import { useEffect, useState } from 'react';
import { Camera, ChevronDown, ChevronUp, ExternalLink, Loader2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { captureFileUrl, type DocumentCaptureRecord } from '../../lib/workspace-api';
import { glassClass } from './dashboard-ui';

const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

export function DocumentPhotoViewer({
  documentId,
  captures,
  activeCaptureId,
  onSelectCapture,
  caption,
  canAddPage,
  uploading,
  onAddPage,
  canRetry,
  retrying,
  onRetry,
}: {
  documentId: string;
  captures: DocumentCaptureRecord[];
  activeCaptureId: string | null;
  onSelectCapture: (captureId: string) => void;
  caption?: string | null;
  canAddPage: boolean;
  uploading: boolean;
  onAddPage: () => void;
  canRetry: boolean;
  retrying: boolean;
  onRetry: (captureId: string) => void;
}) {
  const { t } = useTranslation();
  const [zoomIndex, setZoomIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const active = captures.find((capture) => capture.id === activeCaptureId) ?? captures[0];

  useEffect(() => {
    setZoomIndex(0);
  }, [active?.id]);

  if (!active) return null;
  const fileUrl = captureFileUrl(documentId, active.id);
  const reading = active.extractionStatus === 'QUEUED' || active.extractionStatus === 'RUNNING';
  const zoom = ZOOM_STEPS[zoomIndex];

  const iconButton =
    'flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:text-ops-accent disabled:opacity-40';

  return (
    <section className={cn(glassClass, 'flex flex-col lg:h-full', !collapsed && 'max-lg:h-[40dvh]')}>
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-ops-canvas/60 px-2.5 py-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {captures.map((capture) => (
            <button
              key={capture.id}
              type="button"
              onClick={() => onSelectCapture(capture.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 font-display text-[0.72rem] font-medium transition-colors',
                capture.id === active.id ? 'bg-white text-ops-ink shadow-sm' : 'text-slate-500 hover:text-ops-ink',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  capture.extractionStatus === 'SUCCEEDED' && 'bg-ops-teal',
                  capture.extractionStatus === 'FAILED' && 'bg-ops-danger',
                  (capture.extractionStatus === 'QUEUED' || capture.extractionStatus === 'RUNNING') && 'animate-pulse bg-ops-accent',
                )}
              />
              {t('doc.pageAlt', { n: capture.pageNumber })}
            </button>
          ))}
          {canAddPage && (
            <button
              type="button"
              disabled={uploading}
              onClick={onAddPage}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-display text-[0.72rem] font-medium text-ops-teal hover:bg-teal-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              {t('doc.addPage')}
            </button>
          )}
        </div>
        <div className={cn('flex shrink-0 gap-1', collapsed && 'max-lg:hidden')}>
          <button type="button" className={iconButton} disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => i - 1)} aria-label={t('doc.zoomOut')}>
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex((i) => i + 1)}
            aria-label={t('doc.zoomIn')}
          >
            <ZoomIn size={14} />
          </button>
          <a href={fileUrl} target="_blank" rel="noreferrer" className={iconButton} aria-label={t('doc.openOriginal')}>
            <ExternalLink size={14} />
          </a>
        </div>
        <button
          type="button"
          className={cn(iconButton, 'lg:hidden')}
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? t('doc.showPhoto') : t('doc.hidePhoto')}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      <div className={cn('relative min-h-0 flex-1 overflow-auto bg-slate-100', collapsed && 'max-lg:hidden')}>
        <img
          src={fileUrl}
          alt={t('doc.pageAlt', { n: active.pageNumber })}
          style={{ width: `${zoom * 100}%` }}
          className="block h-auto max-w-none"
        />
        {reading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 font-display text-[0.8rem] font-medium text-ops-accent">
            <Loader2 size={20} className="animate-spin" />
            {t('doc.readingThumb')}
          </div>
        )}
        {active.extractionFailed && canRetry && (
          <button
            type="button"
            disabled={retrying}
            onClick={() => onRetry(active.id)}
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-ops-danger px-2.5 py-1.5 font-display text-[0.72rem] font-medium text-white shadow disabled:opacity-60"
          >
            <RotateCw size={12} />
            {t('doc.retry')}
          </button>
        )}
      </div>

      {caption && !collapsed && (
        <p className="border-t border-slate-100 bg-indigo-50 px-3 py-2 font-sans text-[0.74rem] leading-snug text-ops-accent">{caption}</p>
      )}
    </section>
  );
}
