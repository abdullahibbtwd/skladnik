import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Building2, ScanLine, Sparkles, MessageSquareQuote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '../../components/dashboard/dashboard-ui';
import { fetchPlatformAnalyticsSummary } from '../../lib/platform-api';
import { platformPanelClass } from './platform-ui';

const TEAL = '#0d9488';
const ACCENT = '#4f46e5';

export function PlatformAnalyticsPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState<30 | 90>(30);

  const summaryQuery = useQuery({
    queryKey: ['platform', 'analytics', days],
    queryFn: () => fetchPlatformAnalyticsSummary(days),
  });

  const summary = summaryQuery.data;
  const signupsByDay = summary?.series?.signupsByDay ?? [];
  const quotesByDay = summary?.series?.quotesByDay ?? [];
  const utmSources = summary?.utmSources ?? [];
  const quotesByStatus = summary?.quotesByStatus ?? { NEW: 0, CONTACTED: 0, CLOSED: 0 };
  const metrics = summary?.metrics;
  const funnel = summary?.funnel;

  const trendData = useMemo(
    () =>
      signupsByDay.map((row, index) => ({
        date: row.date.slice(5),
        signups: row.count,
        quotes: quotesByDay[index]?.count ?? 0,
      })),
    [signupsByDay, quotesByDay],
  );

  const utmData = useMemo(
    () =>
      utmSources.map((row) => ({
        source: row.source === '(none)' ? t('platform.analytics.noUtm') : row.source,
        count: row.count,
      })),
    [utmSources, t],
  );

  const funnelMax = Math.max(
    funnel?.companiesCreated ?? 0,
    funnel?.firstScan ?? 0,
    funnel?.stillTrial ?? 0,
    funnel?.activated ?? 0,
    1,
  );

  const cards = [
    {
      key: 'quotes',
      label: t('platform.analytics.quotes'),
      value: metrics?.quotesInRange ?? '—',
      hint: t('platform.analytics.inLastDays', { days }),
      icon: MessageSquareQuote,
      tone: 'text-ops-accent bg-indigo-50 border-ops-accent/15',
    },
    {
      key: 'companies',
      label: t('platform.analytics.companies'),
      value: metrics?.companiesInRange ?? '—',
      hint: t('platform.analytics.inLastDays', { days }),
      icon: Building2,
      tone: 'text-ops-teal bg-teal-50 border-ops-teal/15',
    },
    {
      key: 'scans',
      label: t('platform.analytics.firstScans'),
      value: metrics?.firstScansInRange ?? '—',
      hint: t('platform.analytics.firstScansHint'),
      icon: ScanLine,
      tone: 'text-ops-teal bg-teal-50 border-ops-teal/15',
    },
    {
      key: 'utm',
      label: t('platform.analytics.topUtm'),
      value: metrics?.topUtmSource ?? t('platform.analytics.noUtm'),
      hint:
        metrics?.topUtmCount != null
          ? t('platform.analytics.topUtmHint', { count: metrics.topUtmCount })
          : '—',
      icon: Sparkles,
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
            {t('platform.analytics.title')}
          </h1>
          <p className="mt-1 max-w-2xl font-sans text-[0.8rem] text-slate-500">{t('platform.analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {([30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={
                days === value
                  ? 'rounded-xl border border-ops-teal/25 bg-ops-teal/10 px-3 py-2 font-display text-[0.78rem] font-medium text-ops-teal'
                  : 'rounded-xl border border-slate-200 bg-white px-3 py-2 font-display text-[0.78rem] font-medium text-slate-500 hover:border-ops-accent/30 hover:text-ops-accent'
              }
            >
              {t('platform.analytics.days', { count: value })}
            </button>
          ))}
          <span className="ml-1 flex size-10 items-center justify-center rounded-2xl border border-ops-teal/15 bg-teal-50 text-ops-teal">
            <BarChart3 size={18} />
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(30,27,75,0.12)] sm:p-5"
          >
            <div className="pointer-events-none absolute -top-8 -right-6 size-24 rounded-full bg-gradient-to-br from-ops-teal/10 to-transparent" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[0.78rem] font-medium text-slate-500">{card.label}</p>
                <p className="mt-2 truncate font-display text-[1.45rem] font-semibold tracking-tight text-ops-ink tabular-nums">
                  {summaryQuery.isLoading ? '…' : card.value}
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <GlassPanel title={t('platform.analytics.trendTitle')}>
          <div className="mb-3 flex flex-wrap gap-3">
            <LegendSwatch color={TEAL} label={t('platform.analytics.signups')} />
            <LegendSwatch color={ACCENT} label={t('platform.analytics.quotesSeries')} />
          </div>
          <div className="h-64 w-full">
            {summaryQuery.isLoading ? (
              <p className="font-sans text-sm text-slate-400">{t('platform.analytics.loading')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEAL} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 24px -12px rgba(30,27,75,0.18)',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="signups"
                    name={t('platform.analytics.signups')}
                    stroke={TEAL}
                    fill="url(#signupFill)"
                    strokeWidth={2}
                  />
                  <Bar
                    dataKey="quotes"
                    name={t('platform.analytics.quotesSeries')}
                    fill={ACCENT}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={18}
                    opacity={0.85}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassPanel>

        <GlassPanel title={t('platform.analytics.utmTitle')}>
          <div className="h-64 w-full">
            {summaryQuery.isLoading ? (
              <p className="font-sans text-sm text-slate-400">{t('platform.analytics.loading')}</p>
            ) : utmData.length === 0 ? (
              <p className="font-sans text-sm text-slate-500">{t('platform.analytics.utmEmpty')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utmData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="source"
                    width={88}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name={t('platform.analytics.companies')} fill={TEAL} radius={[0, 8, 8, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel title={t('platform.analytics.funnelTitle')}>
          <div className="flex flex-col gap-3">
            {(
              [
                ['companiesCreated', funnel?.companiesCreated],
                ['firstScan', funnel?.firstScan],
                ['stillTrial', funnel?.stillTrial],
                ['activated', funnel?.activated],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-slate-100 bg-ops-canvas/70 px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-display text-[0.8rem] text-slate-500">{t(`platform.analytics.funnel.${key}`)}</p>
                  <p className="font-display text-[0.95rem] font-semibold tabular-nums text-ops-ink">
                    {summaryQuery.isLoading ? '…' : (value ?? 0)}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-ops-teal to-ops-accent transition-all"
                    style={{ width: `${Math.round(((value ?? 0) / funnelMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel title={t('platform.analytics.statusTitle')}>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['NEW', 'CONTACTED', 'CLOSED'] as const).map((status) => (
              <div key={status} className={`${platformPanelClass} border-slate-100 p-4 text-center shadow-none`}>
                <p className="font-display text-[0.72rem] tracking-wider text-slate-500 uppercase">
                  {t(`platform.quotes.status.${status}`)}
                </p>
                <p className="mt-2 font-display text-[1.5rem] font-semibold tabular-nums text-ops-ink">
                  {summaryQuery.isLoading ? '…' : (quotesByStatus[status] ?? 0)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-sans text-[0.72rem] text-slate-400">{t('platform.analytics.statusNote')}</p>
        </GlassPanel>
      </div>

      {summaryQuery.isError && (
        <p className="rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3 py-2.5 font-sans text-sm text-ops-danger">
          {summaryQuery.error instanceof Error
            ? summaryQuery.error.message
            : t('platform.analytics.loading')}
        </p>
      )}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-display text-[0.72rem] text-slate-500">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
