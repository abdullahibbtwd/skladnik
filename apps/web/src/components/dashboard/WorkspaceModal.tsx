import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function WorkspaceModal({
  title,
  isOpen,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(30,27,75,0.45)] p-0 backdrop-blur-md sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white text-ops-ink shadow-[0_24px_80px_-20px_rgba(30,27,75,0.28)] sm:rounded-2xl ${wide ? 'max-w-[640px]' : 'max-w-[520px]'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <h2 className="font-display text-[1.02rem] font-semibold text-ops-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-ops-canvas hover:text-ops-ink"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-5 sm:px-5 sm:py-6">{children}</div>
      </div>
    </div>
  );
}
