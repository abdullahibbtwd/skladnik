import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, CreditCard, Plus, TimerReset, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassPanel, LiveBadge } from '../../components/dashboard/dashboard-ui';
import { fetchPlatformStats, listPlatformSubscriptions } from '../../lib/platform-api';
import { platformPrimaryBtnClass, platformSecondaryBtnClass, platformStatusTone } from './platform-ui';

function formatMoney(minor: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function PlatformDashboardPage() {
  const { t } = useTranslation();

  const statsQuery = useQuery({
    queryKey: ['platform', 'stats'],
    queryFn: fetchPlatformStats,
  });

  const recentQuery = useQuery({
    queryKey: ['platform', 'subscriptions', 'recent'],
    queryFn: () => listPlatformSubscriptions({ status: 'PENDING', page: 1, pageSize: 5 }),
  });

  const stats = statsQuery.data;
  const live = (stats?.active ?? 0) + (stats?.trial ?? 0);
  const recent = recentQuery.data?.subscriptions ?? [];

  const cards = [
    {
      key: 'total',
      label: t('platform.dashboard.total'),
      value: stats?.total ?? '—',
      hint: t('platform.dashboard.totalHint'),
      icon: CreditCard,
      tone: 'text-ops-teal bg-teal-50 border-ops-teal/15',
    },
    {
      key: 'pending',
      label: t('platform.dashboard.pending'),
      value: stats?.pending ?? '—',
      hint: t('platform.dashboard.pendingHint'),
      icon: TimerReset,
      tone: 'text-ops-accent bg-indigo-50 border-ops-accent/15',
    },
    {
      key: 'live',
      label: t('platform.dashboard.live'),
      value: statsQuery.isLoading ? '—' : live,
      hint: t('platform.dashboard.liveHint'),
      icon: Activity,
      tone: 'text-ops-teal bg-teal-50 border-ops-teal/15',
    },
    {
      key: 'revenue',
      label: t('platform.dashboard.revenue'),
      value: stats ? formatMoney(stats.totalPaidMinor) : '—',
      hint: t('platform.dashboard.revenueHint', { count: stats?.paidInvoices ?? 0 }),
      icon: Wallet,
      tone: 'text-ops-ink bg-ops-canvas border-slate-200',
    },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.72rem] font-medium tracking-wider text-ops-accent uppercase">
            {t('platform.brand')}
          </p>
          <h1 className="mt-1 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
            {t('platform.dashboard.title')}
          </h1>
          <p className="mt-1 max-w-xl font-sans text-[0.8rem] text-slate-500">{t('platform.dashboard.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/platform/subscriptions" className={platformSecondaryBtnClass}>
            {t('platform.dashboard.viewAll')}
            <ArrowRight size={14} />
          </Link>
          <Link to="/platform/subscriptions?create=1" className={platformPrimaryBtnClass}>
            <Plus size={16} />
            {t('platform.dashboard.newSubscription')}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(30,27,75,0.12)] sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[0.78rem] font-medium text-slate-500">{card.label}</p>
                <p className="mt-2 font-display text-[1.55rem] font-semibold tracking-tight text-ops-ink tabular-nums">
                  {statsQuery.isLoading && card.key !== 'revenue' ? '…' : card.value}
                </p>
                <p className="mt-1 font-sans text-[0.72rem] text-slate-400">{card.hint}</p>
              </div>
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${card.tone}`}>
                <card.icon size={18} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <GlassPanel
          title={t('platform.dashboard.pendingQueue')}
          action={
            <LiveBadge>
              {t('platform.dashboard.pendingCount', { count: stats?.pending ?? recentQuery.data?.total ?? 0 })}
            </LiveBadge>
          }
        >
          {recentQuery.isLoading && (
            <p className="font-sans text-sm text-slate-400">{t('platform.dashboard.loadingRecent')}</p>
          )}
          {!recentQuery.isLoading && recent.length === 0 && (
            <p className="font-sans text-sm text-slate-500">{t('platform.dashboard.noPending')}</p>
          )}
          {recent.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {recent.map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/platform/subscriptions/${row.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-ops-canvas/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-[0.88rem] font-medium text-ops-ink">
                        {row.company?.name || row.companyNameHint || t('platform.subscriptions.unbound')}
                      </p>
                      <p className="mt-0.5 truncate font-sans text-[0.72rem] text-slate-500">
                        {row.plan} · {row.contactEmail || '—'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-display text-[0.68rem] font-medium ${platformStatusTone(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel title={t('platform.dashboard.invoiceSnapshot')}>
          <dl className="grid gap-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-ops-canvas/70 px-3.5 py-3">
              <dt className="font-display text-[0.8rem] text-slate-500">{t('platform.dashboard.issuedInvoices')}</dt>
              <dd className="font-display text-[0.95rem] font-semibold tabular-nums text-ops-ink">
                {stats?.issuedInvoices ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-ops-canvas/70 px-3.5 py-3">
              <dt className="font-display text-[0.8rem] text-slate-500">{t('platform.dashboard.paidInvoices')}</dt>
              <dd className="font-display text-[0.95rem] font-semibold tabular-nums text-ops-teal">
                {stats?.paidInvoices ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-ops-canvas/70 px-3.5 py-3">
              <dt className="font-display text-[0.8rem] text-slate-500">{t('platform.dashboard.voidInvoices')}</dt>
              <dd className="font-display text-[0.95rem] font-semibold tabular-nums text-ops-ink">
                {stats?.voidInvoices ?? '—'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 font-sans text-[0.72rem] text-slate-400">{t('platform.dashboard.currencyNote')}</p>
        </GlassPanel>
      </div>
    </div>
  );
}
