import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDay } from '../../lib/business-date';
import { ApiError, type DocumentDetail } from '../../lib/workspace-api';
import { useReverseDocument } from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { confirm } from '../ui/Dialog';
import { toast } from '../ui/Toaster';
import { GhostButton, GlassPanel } from './dashboard-ui';

/** "Reverses …" on a reversal, "Reversed by …" on the document it undid. */
export const ReversalNotice: React.FC<{ document: DocumentDetail }> = ({ document }) => {
  const { t, i18n } = useTranslation();
  if (document.reversalOf) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-sans text-[0.82rem] text-rose-900">
        {t('reversal.reverses')}{' '}
        <Link to={`/app/invoices/${document.reversalOf.id}`} className="font-medium underline underline-offset-2">
          {document.reversalOf.documentNumber}
        </Link>{' '}
        {t('reversal.reversesOf', { date: formatDay(document.reversalOf.issuedOn, i18n.language) })}
        {document.notes && <span className="block text-rose-800/80">{t('reversal.reason', { reason: document.notes })}</span>}
      </div>
    );
  }
  if (document.reversedBy) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-sans text-[0.82rem] text-amber-900">
        {t('reversal.reversedBy', {
          date: formatDay(document.reversedBy.issuedOn, i18n.language),
          by: document.reversedBy.by ?? '—',
        })}{' '}
        <Link to={`/app/invoices/${document.reversedBy.id}`} className="font-medium underline underline-offset-2">
          {document.reversedBy.documentNumber}
        </Link>
        {document.reversedBy.reason && (
          <span className="block text-amber-800/80">{t('reversal.reason', { reason: document.reversedBy.reason })}</span>
        )}
      </div>
    );
  }
  return null;
};

/** A posted document is never edited or deleted: it is undone by a linked opposite document. */
export const ReversePanel: React.FC<{ document: DocumentDetail }> = ({ document }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reverse = useReverseDocument(document.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const purchase = document.direction === 'IN' && (document.type === 'INVOICE' || document.type === 'RECEIPT');
  const ready = reason.trim().length >= 3;

  const submit = async (confirmFiledPeriod = false): Promise<void> => {
    if (!ready || reverse.isPending) return;
    setError(null);
    try {
      const result = await reverse.mutateAsync({ reason: reason.trim(), confirmFiledPeriod });
      toast.success(t('reversal.done', { number: document.documentNumber, reversal: result.document.documentNumber }));
      navigate(`/app/invoices/${result.document.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'FILED_PERIOD_CONFIRM') {
        const ok = await confirm({
          title: t('reversal.filedTitle'),
          description: err.message,
          confirmLabel: t('reversal.confirm'),
          danger: true,
        });
        if (ok) await submit(true);
        return;
      }
      setError(err instanceof Error ? err.message : t('reversal.failed'));
    }
  };

  return (
    <GlassPanel>
      {open ? (
        <div className="flex flex-col gap-3">
          <p className="font-sans text-[0.84rem] text-slate-600">{t('reversal.explain')}</p>
          {purchase && <p className="font-sans text-[0.8rem] text-slate-500">{t('reversal.returnsHint')}</p>}
          <div>
            <FieldLabel htmlFor="reverse-reason">{t('reversal.reasonField')}</FieldLabel>
            <input
              id="reverse-reason"
              value={reason}
              maxLength={500}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reversal.reasonPlaceholder')}
              className="w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-[0.65rem] font-sans text-[0.88rem] text-ops-ink outline-none focus:border-ops-teal/50 focus:bg-white"
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ready || reverse.isPending}
              className="flex items-center gap-2 rounded-xl bg-ops-danger px-4 py-2.5 font-display text-[0.84rem] font-semibold text-white disabled:opacity-50"
            >
              <Undo2 size={15} />
              {reverse.isPending ? t('common.saving') : t('reversal.confirm')}
            </button>
            <GhostButton onClick={() => setOpen(false)}>{t('common.cancel')}</GhostButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-sans text-[0.8rem] text-slate-500">{t('reversal.hint')}</p>
          <GhostButton danger onClick={() => setOpen(true)}>
            <span className="inline-flex items-center gap-1">
              <Undo2 size={13} /> {t('reversal.reverse')}
            </span>
          </GhostButton>
        </div>
      )}
    </GlassPanel>
  );
};
