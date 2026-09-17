import { create } from 'zustand';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
};

type ToastState = {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
};

const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const id = crypto.randomUUID();
    set((state) => ({ items: [...state.items.slice(-2), { ...item, id }] }));
    window.setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 3600);
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

function show(kind: ToastKind, message: string, description?: string) {
  useToastStore.getState().push({ kind, message, description });
}

export const toast = {
  success: (message: string, description?: string) => show('success', message, description),
  error: (message: string, description?: string) => show('error', message, description),
  info: (message: string, description?: string) => show('info', message, description),
  warning: (message: string, description?: string) => show('warning', message, description),
};

const KIND = {
  success: {
    icon: CheckCircle2,
    iconClass: 'bg-teal-50 text-ops-teal',
    bar: 'bg-ops-teal',
  },
  error: {
    icon: XCircle,
    iconClass: 'bg-rose-50 text-ops-danger',
    bar: 'bg-ops-danger',
  },
  info: {
    icon: Info,
    iconClass: 'bg-indigo-50 text-ops-accent',
    bar: 'bg-ops-accent',
  },
  warning: {
    icon: TriangleAlert,
    iconClass: 'bg-orange-50 text-ops-warn',
    bar: 'bg-ops-warn',
  },
};

export function Toaster() {
  const { t } = useTranslation();
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[160] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end">
      {items.map((item) => {
        const kind = KIND[item.kind];
        const Icon = kind.icon;
        return (
          <div
            key={item.id}
            className="pointer-events-auto relative flex w-full max-w-[22.5rem] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_18px_40px_-18px_rgba(30,27,75,0.35)] backdrop-blur-xl"
          >
            <span className={cn('w-1 shrink-0', kind.bar)} />
            <div className="flex flex-1 items-start gap-3 px-3.5 py-3">
              <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl', kind.iconClass)}>
                <Icon size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-display text-[0.86rem] font-semibold text-ops-ink">{item.message}</p>
                {item.description && (
                  <p className="mt-0.5 font-sans text-[0.75rem] leading-snug text-slate-500">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-ops-canvas hover:text-ops-ink"
                aria-label={t('common.dismiss')}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
