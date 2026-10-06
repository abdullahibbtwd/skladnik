import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../lib/permissions';
import { activateSubscription, fetchCurrentSubscription } from '../../lib/workspace-api';
import { FieldLabel, textFieldClass } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { GlassPanel, PageHeader } from './dashboard-ui';

export const SubscriptionSettings: React.FC = () => {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentQuery = useQuery({
    queryKey: ['workspace', 'subscription', 'current'],
    queryFn: fetchCurrentSubscription,
  });

  const activateMutation = useMutation({
    mutationFn: activateSubscription,
    onSuccess: async () => {
      setCode('');
      setError(null);
      toast.success(t('subscription.activated'));
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'subscription'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t('subscription.activateFailed'));
    },
  });

  const data = currentQuery.data;
  const sub = data?.subscription;

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
              setError(null);
              activateMutation.mutate(code.trim());
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
              disabled={activateMutation.isPending || code.trim().length < 8}
              className="rounded-xl bg-ops-teal px-4 py-2.5 font-display text-sm font-semibold text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)] hover:bg-ops-teal-hover disabled:opacity-50"
            >
              {activateMutation.isPending ? t('subscription.activating') : t('subscription.activate')}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-ops-danger">{error}</p>}
        </GlassPanel>
      )}
    </div>
  );
};
