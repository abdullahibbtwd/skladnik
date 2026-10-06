import { type FormEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import { SUBSCRIPTION_STATUS_TRANSITIONS, type SubscriptionStatus } from '@skladnik/shared';
import { useTranslation } from 'react-i18next';
import { FieldLabel } from '../../components/PasswordField';
import { Select } from '../../components/ui/Select';
import {
  platformErrorClass,
  platformInputClass,
  platformPanelClass,
  platformPrimaryBtnClass,
  platformSecondaryBtnClass,
} from './platform-ui';

export function allowedSubscriptionTargets(from: SubscriptionStatus): SubscriptionStatus[] {
  return [...SUBSCRIPTION_STATUS_TRANSITIONS[from]];
}

export function StatusTransitionControl({
  status,
  version,
  invoicePaid,
  busy,
  error,
  onTransition,
  iconOnly,
}: {
  status: SubscriptionStatus;
  version: number;
  invoicePaid?: boolean;
  busy?: boolean;
  error?: string | null;
  onTransition: (input: { toStatus: SubscriptionStatus; reason?: string; version: number }) => void;
  /** Compact pencil control for table rows. */
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const targets = allowedSubscriptionTargets(status);
  const [open, setOpen] = useState(false);

  if (targets.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className={
          iconOnly
            ? 'inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent disabled:opacity-60'
            : platformSecondaryBtnClass
        }
        title={t('platform.status.editStatus')}
        aria-label={t('platform.status.editStatus')}
      >
        <Pencil size={iconOnly ? 14 : 14} />
        {!iconOnly && t('platform.status.editStatus')}
      </button>
      {error && <p className={`${platformErrorClass} max-w-[12rem] text-[0.72rem]`}>{error}</p>}
      {open && (
        <TransitionConfirmModal
          fromStatus={status}
          targets={targets}
          invoicePaid={Boolean(invoicePaid)}
          busy={Boolean(busy)}
          onClose={() => setOpen(false)}
          onConfirm={(toStatus, reason) => {
            onTransition({ toStatus, reason, version });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TransitionConfirmModal({
  fromStatus,
  targets,
  invoicePaid,
  busy,
  onClose,
  onConfirm,
}: {
  fromStatus: SubscriptionStatus;
  targets: SubscriptionStatus[];
  invoicePaid: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (toStatus: SubscriptionStatus, reason?: string) => void;
}) {
  const { t } = useTranslation();
  const [toStatus, setToStatus] = useState<SubscriptionStatus>(targets[0]!);
  const needsReason = toStatus === 'SUSPENDED' || toStatus === 'REVOKED';
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const options = useMemo(
    () => targets.map((value) => ({ value, label: value })),
    [targets],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (needsReason && !reason.trim()) {
      setLocalError(t('platform.status.reasonRequired'));
      return;
    }
    onConfirm(toStatus, needsReason ? reason.trim() : undefined);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[175] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`${platformPanelClass} w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.status.editTitle')}</h2>
        <p className="mt-2 text-sm text-slate-500">
          {t('platform.status.editBody', { from: fromStatus })}
        </p>
        {invoicePaid && (toStatus === 'SUSPENDED' || toStatus === 'REVOKED') && (
          <p className="mt-3 rounded-xl border border-ops-warn/30 bg-orange-50 px-3 py-2 text-sm text-ops-warn">
            {t('platform.status.paidInvoiceWarn')}
          </p>
        )}
        <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
          <div>
            <FieldLabel htmlFor="transition-status">{t('platform.status.newStatus')}</FieldLabel>
            <Select id="transition-status" value={toStatus} onChange={setToStatus} options={options} disabled={busy} />
          </div>
          {needsReason && (
            <div>
              <FieldLabel htmlFor="transition-reason">{t('platform.status.reason')}</FieldLabel>
              <textarea
                id="transition-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                className={platformInputClass}
                autoComplete="off"
              />
            </div>
          )}
          {localError && <p className={platformErrorClass}>{localError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={platformSecondaryBtnClass} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={
                toStatus === 'REVOKED'
                  ? 'inline-flex items-center rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3.5 py-2 font-display text-[0.84rem] font-medium text-ops-danger hover:bg-ops-danger/10 disabled:opacity-60'
                  : platformPrimaryBtnClass
              }
            >
              {busy ? t('platform.status.working') : t('common.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
