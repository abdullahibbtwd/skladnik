import React, { useEffect, useState } from 'react';
import { Boxes, X } from 'lucide-react';
import type { SampleInvoice } from './HeroSection';
import { AuthForm } from './AuthForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: 'signup' | 'login';
  pendingInvoice: SampleInvoice | null;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode,
  pendingInvoice,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(30,27,75,0.45)] p-0 backdrop-blur-md sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white text-ops-ink shadow-[0_24px_80px_-20px_rgba(30,27,75,0.28)] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 md:px-6 md:py-5">
          <div className="flex items-center gap-[0.65rem]">
            <div className="flex size-8 items-center justify-center rounded-lg bg-ops-teal text-white">
              <Boxes size={16} strokeWidth={2} />
            </div>
            <span className="font-display text-[1.05rem] font-semibold text-ops-ink">Skladnik</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-ops-canvas hover:text-ops-ink" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-6 md:px-6 md:py-7">
          <AuthForm
            mode={mode}
            onModeChange={setMode}
            pendingInvoice={mode === 'signup' ? pendingInvoice : null}
            onSuccess={onSuccess}
            idPrefix="modal"
            variant="modal"
          />
        </div>
      </div>
    </div>
  );
};
