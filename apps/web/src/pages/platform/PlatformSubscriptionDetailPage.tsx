import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Eye } from 'lucide-react';
import { createPortal } from 'react-dom';
import { INVOICE_STATUS_TRANSITIONS, SUBSCRIPTION_PLANS, type InvoiceStatus, type SubscriptionPlan, type SubscriptionStatus } from '@skladnik/shared';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '../../components/dashboard/dashboard-ui';
import { FieldLabel } from '../../components/PasswordField';
import { confirm } from '../../components/ui/Dialog';
import { Select } from '../../components/ui/Select';
import {
  PlatformApiError,
  downloadPlatformInvoicePdf,
  getPlatformSubscription,
  markPlatformInvoicePaid,
  regeneratePlatformCode,
  revealPlatformActivationCode,
  transitionPlatformSubscription,
  updatePlatformSubscription,
  voidPlatformInvoice,
  type PlatformInvoiceSummary,
} from '../../lib/platform-api';
import { ActivationCodeModal } from './PlatformSubscriptionsPage';
import { StatusTransitionControl } from './StatusTransitionControl';
import {
  platformErrorClass,
  platformInputClass,
  platformPanelClass,
  platformPrimaryBtnClass,
  platformSecondaryBtnClass,
  platformStatusTone,
  platformWarnClass,
} from './platform-ui';

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function PlatformSubscriptionDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [plan, setPlan] = useState<SubscriptionPlan>('STARTER');
  const [maxUsers, setMaxUsers] = useState(5);
  const [termMonths, setTermMonths] = useState(12);
  const [companyNameHint, setCompanyNameHint] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [externalInvoiceRef, setExternalInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');

  const detailQuery = useQuery({
    queryKey: ['platform', 'subscription', id],
    queryFn: () => getPlatformSubscription(id),
    enabled: Boolean(id),
  });

  const sub = detailQuery.data?.subscription;

  useEffect(() => {
    if (!sub) return;
    setPlan(sub.plan);
    setMaxUsers(sub.maxUsers);
    setTermMonths(sub.termMonths);
    setCompanyNameHint(sub.companyNameHint ?? '');
    setContactEmail(sub.contactEmail ?? '');
    setExternalInvoiceRef(sub.externalInvoiceRef ?? '');
    setNotes(sub.notes ?? '');
  }, [sub]);

  const planOptions = useMemo(
    () => SUBSCRIPTION_PLANS.map((value) => ({ value, label: value })),
    [],
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['platform', 'subscription', id] });
    await queryClient.invalidateQueries({ queryKey: ['platform', 'subscriptions'] });
  };

  const updateMutation = useMutation({
    mutationFn: (input: {
      plan: SubscriptionPlan;
      maxUsers: number;
      termMonths: number;
      companyNameHint?: string;
      contactEmail?: string;
      notes?: string;
      externalInvoiceRef?: string;
    }) => updatePlatformSubscription(id, input),
    onSuccess: async () => {
      setEditError(null);
      await invalidate();
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : t('platform.detail.saveFailed')),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regeneratePlatformCode(id),
    onSuccess: async (result) => {
      setRevealedCode(result.activationCode);
      setCopied(false);
      setActionError(null);
      await invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : t('platform.detail.actionFailed')),
  });

  const transitionMutation = useMutation({
    mutationFn: (input: { toStatus: SubscriptionStatus; reason?: string; version: number }) =>
      transitionPlatformSubscription(id, input),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (err) => {
      setActionError(
        err instanceof PlatformApiError && err.code === 'VERSION_CONFLICT'
          ? t('platform.status.versionConflict')
          : err instanceof Error
            ? err.message
            : t('platform.detail.actionFailed'),
      );
      void invalidate();
    },
  });

  const revealMutation = useMutation({
    mutationFn: (totpCode: string) => revealPlatformActivationCode(id, totpCode),
    onSuccess: (result) => {
      setRevealOpen(false);
      setRevealedCode(result.activationCode);
      setCopied(false);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : t('platform.detail.revealFailed')),
  });

  const invoiceMutation = useMutation({
    mutationFn: async (args: {
      action: 'paid' | 'void' | 'pdf';
      invoice: PlatformInvoiceSummary;
      paymentReference?: string;
      paymentDate?: string;
      reason?: string;
    }) => {
      if (args.action === 'pdf') {
        await downloadPlatformInvoicePdf(id, args.invoice.id, `${args.invoice.number}.pdf`);
        return null;
      }
      if (args.action === 'paid') {
        return markPlatformInvoicePaid(id, args.invoice.id, {
          paymentReference: args.paymentReference!,
          paymentDate: args.paymentDate,
        });
      }
      return voidPlatformInvoice(id, args.invoice.id, { reason: args.reason! });
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : t('platform.detail.actionFailed')),
  });

  if (detailQuery.isLoading) {
    return <p className="text-sm text-slate-500">{t('platform.detail.loading')}</p>;
  }

  if (!sub) {
    return (
      <div>
        <p className="text-sm text-ops-danger">{t('platform.detail.missing')}</p>
        <Link to="/platform/subscriptions" className="mt-3 inline-flex text-sm font-medium text-ops-teal hover:underline">
          {t('platform.detail.back')}
        </Link>
      </div>
    );
  }

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    updateMutation.mutate({
      plan,
      maxUsers,
      termMonths,
      companyNameHint: companyNameHint.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      externalInvoiceRef: externalInvoiceRef.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const runRegenerate = async () => {
    const ok = await confirm({
      title: t('platform.detail.confirmRegenerate'),
      confirmLabel: t('common.confirm'),
    });
    if (!ok) return;
    regenerateMutation.mutate();
  };

  const canReveal = sub.status === 'PENDING' && sub.activationCodes.some((code) => code.revealable);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          to="/platform/subscriptions"
          className="inline-flex items-center gap-1.5 font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent"
        >
          <ArrowLeft size={14} />
          {t('platform.detail.back')}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
              {sub.company?.name || sub.companyNameHint || t('platform.subscriptions.unbound')}
            </h1>
            <p className="mt-1 font-mono text-xs text-slate-400">{sub.id}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${platformStatusTone(sub.status)}`}>
            {sub.status}
          </span>
        </div>
      </div>

      <GlassPanel title={t('platform.status.title')}>
        <StatusTransitionControl
          status={sub.status}
          version={sub.version}
          invoicePaid={sub.latestInvoice?.status === 'PAID'}
          busy={transitionMutation.isPending}
          error={actionError}
          onTransition={(input) => transitionMutation.mutate(input)}
        />
      </GlassPanel>

      <div className="flex flex-wrap gap-2">
        {sub.status === 'PENDING' && (
          <button
            type="button"
            onClick={() => void runRegenerate()}
            disabled={regenerateMutation.isPending}
            className={platformSecondaryBtnClass}
          >
            {t('platform.detail.regenerate')}
          </button>
        )}
        {canReveal && (
          <button type="button" onClick={() => setRevealOpen(true)} className={platformSecondaryBtnClass}>
            <Eye size={14} />
            {t('platform.detail.reveal')}
          </button>
        )}
      </div>

      <GlassPanel title={t('platform.detail.editTitle')}>
        <form onSubmit={onSave} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="edit-plan">{t('platform.subscriptions.plan')}</FieldLabel>
              <Select
                id="edit-plan"
                value={plan}
                onChange={setPlan}
                options={planOptions}
                disabled={sub.status === 'REVOKED'}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-max-users">{t('platform.subscriptions.maxUsers')}</FieldLabel>
              <input
                id="edit-max-users"
                type="number"
                min={1}
                value={maxUsers}
                onChange={(e) => setMaxUsers(Number(e.target.value))}
                disabled={sub.status === 'REVOKED'}
                className={platformInputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-term">{t('platform.subscriptions.termMonths')}</FieldLabel>
              <input
                id="edit-term"
                type="number"
                min={1}
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value))}
                disabled={sub.status === 'REVOKED'}
                className={platformInputClass}
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="edit-company">{t('platform.subscriptions.companyHint')}</FieldLabel>
            <input
              id="edit-company"
              value={companyNameHint}
              onChange={(e) => setCompanyNameHint(e.target.value)}
              disabled={sub.status === 'REVOKED'}
              className={platformInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="edit-email">{t('platform.subscriptions.contactEmail')}</FieldLabel>
            <input
              id="edit-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={sub.status === 'REVOKED'}
              className={platformInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="edit-invoice">{t('platform.subscriptions.invoiceRef')}</FieldLabel>
            <input
              id="edit-invoice"
              value={externalInvoiceRef}
              onChange={(e) => setExternalInvoiceRef(e.target.value)}
              disabled={sub.status === 'REVOKED'}
              className={platformInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="edit-notes">{t('platform.subscriptions.notes')}</FieldLabel>
            <textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={sub.status === 'REVOKED'}
              className={platformInputClass}
            />
          </div>
          {editError && <p className={platformErrorClass}>{editError}</p>}
          <button
            type="submit"
            disabled={updateMutation.isPending || sub.status === 'REVOKED'}
            className={`${platformPrimaryBtnClass} w-fit`}
          >
            {updateMutation.isPending ? t('platform.detail.saving') : t('platform.detail.save')}
          </button>
        </form>
      </GlassPanel>

      <GlassPanel title={t('platform.detail.invoices')}>
        <ul className="space-y-3 text-sm">
          {(sub.invoices ?? []).length === 0 && (
            <li className="py-4 text-center text-slate-400">{t('common.none')}</li>
          )}
          {(sub.invoices ?? []).map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              busy={invoiceMutation.isPending}
              onPaid={(paymentReference, paymentDate) =>
                invoiceMutation.mutate({ action: 'paid', invoice, paymentReference, paymentDate })
              }
              onVoid={(reason) => invoiceMutation.mutate({ action: 'void', invoice, reason })}
              onPdf={() => invoiceMutation.mutate({ action: 'pdf', invoice })}
            />
          ))}
        </ul>
      </GlassPanel>

      <GlassPanel title={t('platform.detail.codes')}>
        <ul className="space-y-2 text-sm">
          {sub.activationCodes.length === 0 && (
            <li className="py-4 text-center text-slate-400">{t('common.none')}</li>
          )}
          {sub.activationCodes.map((code) => (
            <li
              key={code.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2.5"
            >
              <span className="font-mono text-ops-ink">{code.codePrefix}…</span>
              <span className="text-xs text-slate-500">
                {code.revokedAt
                  ? t('platform.detail.codeRevoked')
                  : code.redeemedAt
                    ? t('platform.detail.codeRedeemed')
                    : code.revealable
                      ? t('platform.detail.codeRevealable')
                      : t('platform.detail.codeOpen')}
                {' · '}
                {new Date(code.expiresAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </GlassPanel>

      <GlassPanel title={t('platform.detail.events')}>
        <ul className="space-y-2 text-sm">
          {sub.events.length === 0 && (
            <li className="py-4 text-center text-slate-400">{t('common.none')}</li>
          )}
          {sub.events.map((event) => (
            <li key={event.id} className="rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display font-medium text-ops-ink">{event.type}</span>
                <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              {(event.fromStatus || event.toStatus) && (
                <p className="mt-1 text-xs text-slate-500">
                  {event.fromStatus ?? '—'} → {event.toStatus ?? '—'}
                </p>
              )}
            </li>
          ))}
        </ul>
      </GlassPanel>

      {revealOpen && (
        <RevealCodeModal
          busy={revealMutation.isPending}
          error={revealMutation.error instanceof Error ? revealMutation.error.message : null}
          onClose={() => {
            if (!revealMutation.isPending) setRevealOpen(false);
          }}
          onSubmit={(totpCode) => revealMutation.mutate(totpCode)}
        />
      )}

      {revealedCode && (
        <ActivationCodeModal
          code={revealedCode}
          copied={copied}
          onCopy={async () => {
            await navigator.clipboard.writeText(revealedCode);
            setCopied(true);
          }}
          onClose={() => {
            setRevealedCode(null);
            setCopied(false);
          }}
        />
      )}
    </div>
  );
}

function InvoiceRow({
  invoice,
  busy,
  onPaid,
  onVoid,
  onPdf,
}: {
  invoice: PlatformInvoiceSummary;
  busy: boolean;
  onPaid: (paymentReference: string, paymentDate?: string) => void;
  onVoid: (reason: string) => void;
  onPdf: () => void;
}) {
  const { t } = useTranslation();
  const [paidOpen, setPaidOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const canPaid = INVOICE_STATUS_TRANSITIONS[invoice.status as InvoiceStatus]?.includes('PAID');
  const canVoid = INVOICE_STATUS_TRANSITIONS[invoice.status as InvoiceStatus]?.includes('VOID');

  return (
    <li className="rounded-xl border border-slate-200 bg-ops-canvas px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono font-medium text-ops-ink">{invoice.number}</div>
          <div className="mt-1 text-xs text-slate-500">
            {invoice.status} · {formatMoney(invoice.totalMinor, invoice.currency)} ·{' '}
            {new Date(invoice.issuedAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void onPdf()} disabled={busy} className={platformSecondaryBtnClass}>
            <Download size={14} />
            {t('platform.detail.pdf')}
          </button>
          {canPaid && (
            <button type="button" onClick={() => setPaidOpen(true)} disabled={busy} className={platformSecondaryBtnClass}>
              {t('platform.detail.markPaid')}
            </button>
          )}
          {canVoid && (
            <button
              type="button"
              onClick={() => setVoidOpen(true)}
              disabled={busy}
              className="inline-flex items-center rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3.5 py-2 font-display text-[0.84rem] font-medium text-ops-danger hover:bg-ops-danger/10 disabled:opacity-60"
            >
              {t('platform.detail.voidInvoice')}
            </button>
          )}
        </div>
      </div>
      {paidOpen && (
        <InvoicePaidModal
          busy={busy}
          onClose={() => setPaidOpen(false)}
          onConfirm={(paymentReference, paymentDate) => {
            onPaid(paymentReference, paymentDate);
            setPaidOpen(false);
          }}
        />
      )}
      {voidOpen && (
        <InvoiceVoidModal
          busy={busy}
          onClose={() => setVoidOpen(false)}
          onConfirm={(reason) => {
            onVoid(reason);
            setVoidOpen(false);
          }}
        />
      )}
    </li>
  );
}

function InvoicePaidModal({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (paymentReference: string, paymentDate?: string) => void;
}) {
  const { t } = useTranslation();
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-[175] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <form
        className={`${platformPanelClass} w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(paymentReference.trim(), paymentDate || undefined);
        }}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.detail.markPaidTitle')}</h2>
        <p className="mt-2 text-sm text-slate-500">{t('platform.detail.markPaidBody')}</p>
        <div className="mt-4 grid gap-3">
          <div>
            <FieldLabel htmlFor="pay-ref">{t('platform.detail.paymentReference')}</FieldLabel>
            <input
              id="pay-ref"
              required
              disabled={busy}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className={platformInputClass}
              autoComplete="off"
            />
          </div>
          <div>
            <FieldLabel htmlFor="pay-date">{t('platform.detail.paymentDate')}</FieldLabel>
            <input
              id="pay-date"
              type="date"
              disabled={busy}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={platformInputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={platformSecondaryBtnClass}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy} className={platformPrimaryBtnClass}>
            {t('platform.detail.markPaid')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function InvoiceVoidModal({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-[175] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <form
        className={`${platformPanelClass} w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason.trim());
        }}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.detail.voidTitle')}</h2>
        <p className="mt-2 text-sm text-slate-500">{t('platform.detail.voidBody')}</p>
        <div className="mt-4">
          <FieldLabel htmlFor="void-reason">{t('platform.status.reason')}</FieldLabel>
          <textarea
            id="void-reason"
            required
            disabled={busy}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={platformInputClass}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={platformSecondaryBtnClass}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3.5 py-2 font-display text-[0.84rem] font-medium text-ops-danger hover:bg-ops-danger/10 disabled:opacity-60"
          >
            {t('platform.detail.voidInvoice')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function RevealCodeModal({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (totpCode: string) => void;
}) {
  const { t } = useTranslation();
  const [totpCode, setTotpCode] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-[175] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <form
        className={`${platformPanelClass} w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          onSubmit(totpCode.trim());
        }}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.detail.revealTitle')}</h2>
        <p className={`mt-2 ${platformWarnClass}`}>{t('platform.detail.revealWarn')}</p>
        <div className="mt-4">
          <FieldLabel htmlFor="reveal-totp">{t('platform.login.totpCode')}</FieldLabel>
          <input
            id="reveal-totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={busy}
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={platformInputClass}
          />
        </div>
        {error && <p className={`${platformErrorClass} mt-3`}>{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={platformSecondaryBtnClass}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || totpCode.length !== 6} className={platformPrimaryBtnClass}>
            {busy ? t('platform.status.working') : t('platform.detail.reveal')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
