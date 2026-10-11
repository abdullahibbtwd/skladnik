import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

const PULL_THRESHOLD = 72;
const MAX_PULL = 112;

type PullToRefreshProps = {
  children: ReactNode;
  onRefresh: () => Promise<unknown> | unknown;
  /** When true, pull gesture is ignored. */
  disabled?: boolean;
  className?: string;
};

function pageAtTop() {
  return (window.scrollY || document.documentElement.scrollTop) <= 0;
}

/** Skip when a dialog/sheet owns the screen so the gesture does not fight forms. */
function modalBlocksPull() {
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

/**
 * App-wide mobile pull-to-refresh for pages that scroll the window.
 * Touch-only; ignored when not at the top or when a modal is open.
 */
export function PullToRefresh({ children, onRefresh, disabled = false, className }: PullToRefreshProps) {
  const { t } = useTranslation();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const finishRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(PULL_THRESHOLD * 0.65);
    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
      pullRef.current = 0;
    }
  }, [onRefresh]);

  useEffect(() => {
    if (disabled) {
      startY.current = null;
      pulling.current = false;
      setPull(0);
      pullRef.current = 0;
      return;
    }

    const resetPull = () => {
      pulling.current = false;
      pullRef.current = 0;
      setPull(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || modalBlocksPull() || !pageAtTop()) {
        startY.current = null;
        pulling.current = false;
        return;
      }
      startY.current = event.touches[0]?.clientY ?? null;
      pulling.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY.current == null || refreshingRef.current || modalBlocksPull()) return;
      const y = event.touches[0]?.clientY ?? startY.current;
      const delta = y - startY.current;
      if (delta <= 0 || !pageAtTop()) {
        if (pulling.current) resetPull();
        return;
      }
      pulling.current = true;
      const next = Math.min(MAX_PULL, delta * 0.45);
      pullRef.current = next;
      setPull(next);
      if (next > 8 && event.cancelable) event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!pulling.current) {
        startY.current = null;
        return;
      }
      const shouldRefresh = pullRef.current >= PULL_THRESHOLD;
      startY.current = null;
      pulling.current = false;
      if (shouldRefresh) {
        void finishRefresh();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled, finishRefresh]);

  const visible = pull > 4 || refreshing;
  const ready = pull >= PULL_THRESHOLD && !refreshing;
  const label = refreshing
    ? t('common.refreshing')
    : ready
      ? t('common.releaseToRefresh')
      : t('common.pullToRefresh');

  return (
    <div className={cn('relative', className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{ transform: `translateY(${Math.max(0, pull - 28)}px)` }}
        aria-live="polite"
        aria-busy={refreshing}
      >
        <div
          className={cn(
            'flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-3 py-1.5 font-sans text-[0.72rem] font-medium text-slate-600 shadow-sm backdrop-blur-sm transition-opacity',
            visible ? 'opacity-100' : 'opacity-0',
          )}
        >
          {refreshing ? (
            <Loader2 size={14} className="animate-spin text-ops-teal" />
          ) : (
            <RefreshCw
              size={14}
              className="text-ops-teal transition-transform"
              style={{
                transform: `rotate(${Math.min(180, (pull / PULL_THRESHOLD) * 180)}deg)`,
              }}
            />
          )}
          <span>{label}</span>
        </div>
      </div>
      <div
        style={{
          transform: pull > 0 || refreshing ? `translateY(${pull * 0.35}px)` : undefined,
          transition: pulling.current || refreshing ? undefined : 'transform 180ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
