import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/cn';
import i18n from '../../i18n';

type AlertOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
};

type ConfirmOptions = {
  title: string;
  description?: string;
  /** Listed above the description, e.g. the warnings being confirmed. */
  details?: string[];
  /** When set, the confirm button stays disabled until this box is ticked. */
  acknowledgeLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type DialogState =
  | (AlertOptions & { variant: 'alert'; resolve: () => void })
  | (ConfirmOptions & { variant: 'confirm'; resolve: (ok: boolean) => void });

const useDialogStore = create<{
  current: DialogState | null;
  open: (dialog: DialogState) => void;
  close: () => void;
}>((set) => ({
  current: null,
  open: (dialog) => set({ current: dialog }),
  close: () => set({ current: null }),
}));

export function alert(options: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      variant: 'alert',
      confirmLabel: i18n.t('common.ok'),
      ...options,
      resolve,
    });
  });
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      variant: 'confirm',
      confirmLabel: i18n.t('common.confirm'),
      cancelLabel: i18n.t('common.cancel'),
      danger: false,
      ...options,
      resolve,
    });
  });
}

export function DialogHost() {
  const current = useDialogStore((state) => state.current);
  const close = useDialogStore((state) => state.close);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => setAcknowledged(false), [current]);

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (current.variant === 'confirm') current.resolve(false);
      else current.resolve();
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, close]);

  if (!current) return null;

  const finish = (ok: boolean) => {
    if (current.variant === 'confirm') current.resolve(ok);
    else current.resolve();
    close();
  };

  const danger = current.variant === 'confirm' && current.danger;
  const Icon = danger ? AlertTriangle : Info;
  const details = current.variant === 'confirm' ? (current.details ?? []) : [];
  const acknowledgeLabel = current.variant === 'confirm' ? current.acknowledgeLabel : undefined;
  const blocked = Boolean(acknowledgeLabel) && !acknowledged;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-[rgba(30,27,75,0.48)] p-0 backdrop-blur-md sm:items-center sm:p-6"
      onClick={() => finish(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="skladnik-dialog-title"
        className="w-full max-w-[26rem] overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_28px_80px_-24px_rgba(30,27,75,0.4)] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <span
            className={cn(
              'mb-4 flex size-11 items-center justify-center rounded-2xl',
              danger ? 'bg-rose-50 text-ops-danger' : 'bg-indigo-50 text-ops-accent',
            )}
          >
            <Icon size={20} strokeWidth={2.1} />
          </span>
          <h2 id="skladnik-dialog-title" className="font-display text-[1.12rem] font-semibold tracking-tight text-ops-ink">
            {current.title}
          </h2>
          {details.length > 0 && (
            <ul className="mt-2.5 list-disc space-y-1 rounded-xl border border-amber-300/60 bg-amber-50 py-2.5 pr-3 pl-7 font-sans text-[0.8rem] text-amber-900">
              {details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
          {current.description && (
            <p className="mt-1.5 font-sans text-[0.88rem] leading-relaxed text-slate-500">{current.description}</p>
          )}
          {acknowledgeLabel && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2.5 font-sans text-[0.82rem] text-ops-ink">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-ops-danger"
              />
              <span>{acknowledgeLabel}</span>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-ops-canvas/70 px-5 py-3.5 sm:px-6">
          {current.variant === 'confirm' && (
            <button
              type="button"
              onClick={() => finish(false)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-display text-[0.82rem] font-medium text-ops-ink transition-colors hover:bg-white hover:text-ops-accent"
            >
              {current.cancelLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus={!acknowledgeLabel}
            disabled={blocked}
            onClick={() => finish(true)}
            className={cn(
              'rounded-xl px-3.5 py-2 font-display text-[0.82rem] font-medium text-white transition-colors disabled:pointer-events-none disabled:opacity-50',
              danger
                ? 'bg-ops-danger shadow-[0_8px_18px_rgba(225,29,72,0.28)] hover:bg-rose-600'
                : 'bg-ops-teal shadow-[0_8px_18px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover',
            )}
          >
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
