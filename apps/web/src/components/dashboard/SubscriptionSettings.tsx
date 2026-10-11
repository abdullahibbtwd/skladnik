import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiErrorText } from '../../lib/api-error';
import { usePermissions } from '../../lib/permissions';
import {
  ApiError,
  activateSubscription,
  fetchCurrentSubscription,
  previewActivation,
  type ActivationPreview,
} from '../../lib/workspace-api';
import { FieldLabel, textFieldClass } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { GlassPanel, PageHeader } from './dashboard-ui';

export const SubscriptionSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [confirmEik, setConfirmEik] = useState(false);
  const codeEmpty = code.trim().length === 0;

  const currentQuery = useQuery({
    queryKey: ['workspace', 'subscription', 'current'],
    queryFn: fetchCurrentSubscription,
  });

  const previewMutation = useMutation({
    mutationFn: previewActivation,
    onSuccess: (data) => {
      setError(null);
      setConfirmEik(false);
      setPreview(data);
    },
    onError: (err) => {
      setPreview(null);
      setError(formatActivateError(err, t, i18n.language));
    },
  });

  const activateMutation = useMutation({
    mutationFn: ({ value, confirmEikMismatch }: { value: string; confirmEikMismatch?: boolean }) =>
      activateSubscription(value, { confirmEikMismatch }),
    onSuccess: async () => {
      setCode('');
      setError(null);
      setPreview(null);
      setConfirmEik(false);
      toast.success(t('subscription.activated'));
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'subscription'] });
    },
    onError: (err) => {
      setError(formatActivateError(err, t, i18n.language));
    },
  });

  const data = currentQuery.data;
  const sub = data?.subscription;
  const busy = previewMutation.isPending || activateMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('subscription.title')} description={t('subscription.description')} />

      <GlassPanel>
        {currentQuery.isLoading && <p className="text-sm text-slate-500">{t('subscription.loading')}</p>}
        {currentQuery.isError && <p className="text-sm text-ops-danger">{t('subscription.loadFailed')}</p>}
        {data && !sub && (
          <div className="space-y-2">
            <p className="font-display text-sm font-medium text-ops-ink">{t('subscription.noneTitle')}</p>
            <p className="text-sm text-slate-500">{t('subscription.noneBody')}</p>
            <p className="text-sm text-slate-500">
              {t('subscription.seatsUsed', { used: data.seatsUsed, max: '—' })}
            </p>
          </div>
        )}
        {sub && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[0.75rem] font-medium tracking-wide text-slate-500 uppercase">{t('subscription.plan')}</dt>
              <dd className="mt-1 font-display text-base font-semibold text-ops-ink">{sub.plan}</dd>
            </div>
            <div>
              <dt className="text-[0.75rem] font-medium tracking-wide text-slate-500 uppercase">{t('subscription.status')}</dt>
              <dd className="mt-1 font-display text-base font-semibold text-ops-ink">{sub.status}</dd>
            </div>
            <div>
              <dt className="text-[0.75rem] font-medium tracking-wide text-slate-500 uppercase">{t('subscription.seats')}</dt>
              <dd className="mt-1 font-display text-base font-semibold text-ops-ink">
                {t('subscription.seatsUsed', { used: data!.seatsUsed, max: data!.seatsMax ?? sub.maxUsers })}
              </dd>
            </div>
            <div>
              <dt className="text-[0.75rem] font-medium tracking-wide text-slate-500 uppercase">{t('subscription.expires')}</dt>
              <dd className="mt-1 font-display text-base font-semibold text-ops-ink">
                {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : '—'}
              </dd>
            </div>
            {sub.startsAt && (
              <div>
                <dt className="text-[0.75rem] font-medium tracking-wide text-slate-500 uppercase">{t('subscription.starts')}</dt>
                <dd className="mt-1 text-sm text-ops-ink">{new Date(sub.startsAt).toLocaleDateString()}</dd>
              </div>
            )}
            <div>
              <dt className="text-[0.75rem] font-medium tracking-wide text-slate-500 uppercase">{t('subscription.term')}</dt>
              <dd className="mt-1 text-sm text-ops-ink">{t('subscription.termMonths', { count: sub.termMonths })}</dd>
            </div>
          </dl>
        )}
      </GlassPanel>

      {permissions.users && (
        <GlassPanel>
          <div className="mb-4 flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-ops-accent">
              <KeyRound size={18} />
            </span>
            <div>
              <h2 className="font-display text-[1.02rem] font-semibold text-ops-ink">{t('subscription.activateTitle')}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{t('subscription.activateBody')}</p>
            </div>
          </div>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (codeEmpty || busy) return;
              setError(null);
              previewMutation.mutate(code.trim());
            }}
          >
            <div className="min-w-0 flex-1">
              <FieldLabel htmlFor="activation-code">{t('subscription.codeLabel')}</FieldLabel>
              <input
                id="activation-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('subscription.codePlaceholder')}
                className={`${textFieldClass} pl-3 font-mono tracking-wide`}
              />
            </div>
            <button
              type="submit"
              disabled={busy || codeEmpty}
              className="rounded-xl bg-ops-teal px-4 py-2.5 font-display text-sm font-semibold text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)] hover:bg-ops-teal-hover disabled:opacity-50"
            >
              {previewMutation.isPending ? t('subscription.previewing') : t('subscription.activate')}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-ops-danger">{error}</p>}
        </GlassPanel>
      )}

      {preview &&
        createPortal(
          <ActivationConfirmModal
            preview={preview}
            confirmEik={confirmEik}
            onConfirmEikChange={setConfirmEik}
            busy={activateMutation.isPending}
            onClose={() => {
              if (!activateMutation.isPending) setPreview(null);
            }}
            onConfirm={() => {
              if (!preview.eikMatchesCompany && preview.eikMismatchMode === 'WARN' && !confirmEik) {
                setError(t('errors.EIK_MISMATCH_CONFIRM_REQUIRED'));
                return;
              }
              activateMutation.mutate({
                value: code.trim(),
                confirmEikMismatch: !preview.eikMatchesCompany && confirmEik,
              });
            }}
          />,
          document.body,
        )}
    </div>
  );
};

function ActivationConfirmModal({
  preview,
  confirmEik,
  onConfirmEikChange,
  busy,
  onClose,
  onConfirm,
}: {
  preview: ActivationPreview;
  confirmEik: boolean;
  onConfirmEikChange: (value: boolean) => void;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t, i18n } = useTranslation();
  const currentExpires = preview.currentExpires
    ? new Date(preview.currentExpires).toLocaleDateString(i18n.language)
    : null;
  const resultingExpires = new Date(preview.resultingExpires).toLocaleDateString(i18n.language);
  const needsEikConfirm = !preview.eikMatchesCompany && preview.eikMismatchMode === 'WARN';

  const effectKey =
    preview.kind === 'renew'
      ? 'subscription.confirmRenew'
      : preview.kind === 'upgrade'
        ? 'subscription.confirmUpgrade'
        : preview.kind === 'downgrade'
          ? 'subscription.confirmDowngrade'
          : 'subscription.confirmNew';

  return (
    <div
      className="fixed inset-0 z-[175] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-slate-200/80 bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('subscription.confirmTitle')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t(effectKey, {
            plan: preview.plan,
            currentPlan: preview.currentPlan ?? '—',
            currentExpires: currentExpires ?? '—',
            resultingExpires,
            termMonths: preview.termMonths,
          })}
        </p>
        {currentExpires && (
          <p className="mt-3 rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2 text-sm text-ops-ink">
            {t('subscription.confirmExpirySummary', {
              currentExpires,
              resultingExpires,
            })}
          </p>
        )}
        {needsEikConfirm && (
          <label className="mt-4 flex items-start gap-2 text-sm text-ops-warn">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmEik}
              onChange={(e) => onConfirmEikChange(e.target.checked)}
            />
            <span>
              {t('subscription.eikMismatchWarn', {
                buyerEik: preview.buyerEik ?? '—',
              })}
            </span>
          </label>
        )}
        {!preview.eikMatchesCompany && preview.eikMismatchMode === 'BLOCK' && (
          <p className="mt-3 text-sm text-ops-danger">{t('errors.EIK_MISMATCH')}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-display text-sm font-medium text-ops-ink disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={
              busy ||
              (!preview.eikMatchesCompany && preview.eikMismatchMode === 'BLOCK') ||
              (needsEikConfirm && !confirmEik)
            }
            onClick={onConfirm}
            className="rounded-xl bg-ops-teal px-3.5 py-2 font-display text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('subscription.activating') : t('subscription.confirmActivate')}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatActivateError(
  err: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
  language: string,
): string {
  if (err instanceof ApiError && err.code === 'CODE_ALREADY_USED' && err.params.usedAt) {
    const usedAt = new Date(String(err.params.usedAt)).toLocaleDateString(language);
    return t('errors.CODE_ALREADY_USED', { usedAt });
  }
  return apiErrorText(err, t('subscription.activateFailed'));
}
