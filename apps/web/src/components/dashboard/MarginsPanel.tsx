import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Percent, TrendingUp, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSalesManager } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { businessToday, shiftDate } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { useMarginsQuery, useSitesQuery } from '../../lib/workspace-session';
import { DateField } from '../ui/DateField';
import { useDashboard } from './dashboard-context';
import { GlassPanel, MetricCard, MetricGrid, PageHeader, desktopTableWrapClass, mobileCardClass, mobileCardListClass, tableHeadRowClass, tableRowClass } from './dashboard-ui';

type Grouping = 'product' | 'group';

function monthStart(date: string) {
  return `${date.slice(0, 8)}01`;
}

export const MarginsPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthRole();
  const manager = isSalesManager(role);
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const today = businessToday();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [by, setBy] = useState<Grouping>('product');
  const validRange = Boolean(from && to && from <= to);
  const marginsQuery = useMarginsQuery(siteId, from, to, by, manager && validRange);
  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const totals = marginsQuery.data?.totals;
  const rows = marginsQuery.data?.rows ?? [];
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);

  const presets: { label: string; from: string; to: string }[] = [
    { label: t('margins.today'), from: today, to: today },
    { label: t('margins.last7'), from: shiftDate(today, -6), to: today },
    { label: t('margins.thisMonth'), from: monthStart(today), to: today },
    { label: t('margins.last30'), from: shiftDate(today, -29), to: today },
  ];

  if (!manager) {
    return <p className="font-sans text-[0.86rem] text-slate-500">{t('margins.managersOnly')}</p>;
  }

  const marginText = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toFixed(1)}%`);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <button
        type="button"
        onClick={() => navigate('/app/sales')}
        className="flex w-fit items-center gap-1.5 font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent"
      >
        <ArrowLeft size={15} />
        {t('sales.backToSales')}
      </button>
      <PageHeader eyebrow={siteName || undefined} title={t('margins.title')} description={t('margins.desc')} />

      <GlassPanel>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <DateField value={from} max={to || today} onChange={setFrom} aria-label={t('margins.from')} className="w-40" />
            <span className="text-slate-400">–</span>
            <DateField value={to} min={from} max={today} onChange={setTo} aria-label={t('margins.to')} className="w-40" />
            <div className="ml-auto grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-ops-canvas p-1" role="radiogroup" aria-label={t('margins.groupBy')}>
              {(['product', 'group'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={by === option}
                  onClick={() => setBy(option)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 font-display text-[0.78rem] font-medium',
                    by === option ? 'bg-white text-ops-accent shadow-sm' : 'text-slate-500',
                  )}
                >
                  {t(`margins.by.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setFrom(preset.from);
                  setTo(preset.to);
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1 font-display text-[0.74rem] font-medium',
                  from === preset.from && to === preset.to
                    ? 'border-ops-accent/30 bg-indigo-50 text-ops-accent'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-ops-accent/20',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {!validRange && <p className="font-sans text-[0.78rem] text-ops-danger">{t('margins.badRange')}</p>}
          {marginsQuery.isError && <p className="font-sans text-[0.78rem] text-ops-danger">{marginsQuery.error.message}</p>}
        </div>
      </GlassPanel>

      <MetricGrid columns={3}>
        <MetricCard
          label={t('sales.turnover')}
          value={totals ? formatEuro(totals.gross) : '—'}
          hint={totals ? t('margins.netHint', { net: formatEuro(totals.net) }) : ''}
          icon={Wallet}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label={t('sales.profit')}
          value={totals ? formatEuro(totals.profit) : '—'}
          hint={totals ? t('margins.costHint', { cost: formatEuro(totals.cost) }) : ''}
          icon={TrendingUp}
          iconColor={totals && totals.profit < 0 ? 'text-ops-danger' : 'text-ops-teal'}
        />
        <MetricCard label={t('margins.margin')} value={marginText(totals?.marginPercent)} hint={t('margins.marginHint')} icon={Percent} />
      </MetricGrid>
      {totals?.linesWithoutCost ? (
        <p className="-mt-2 font-sans text-[0.74rem] text-amber-700">{t('sales.linesWithoutCost', { count: totals.linesWithoutCost })}</p>
      ) : null}

      <GlassPanel padded={false} title={t(`margins.by.${by}`)}>
        {marginsQuery.isLoading ? (
          <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('sales.noSales')}</p>
        ) : (
          <>
            <ul className={mobileCardListClass()}>
              {rows.map((row) => (
                <li key={row.id ?? `none-${row.name}`} className={mobileCardClass()}>
                  <div className="min-w-0">
                    <p className="font-display text-[0.86rem] font-medium text-ops-ink">
                      {row.id === null && by === 'group' ? t('margins.noGroup') : row.name}
                    </p>
                    {row.code && <p className="font-mono text-[0.66rem] text-slate-400">{row.code}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.74rem] tabular-nums text-slate-500">
                      {by === 'product' && (
                        <span>
                          {t('writeOff.qty')}: {qtyFormat.format(row.quantity)}
                        </span>
                      )}
                      <span>
                        {t('sales.turnover')}: {formatEuro(row.gross)}
                      </span>
                      <span className={cn((row.profit ?? 0) < 0 ? 'text-ops-danger' : 'text-ops-teal')}>
                        {t('sales.profit')}: {row.profit !== undefined ? formatEuro(row.profit) : '—'}
                      </span>
                      <span>
                        {t('margins.margin')}: {marginText(row.marginPercent)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className={desktopTableWrapClass()}>
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-4 py-2.5 font-medium sm:px-5">{by === 'product' ? t('sales.product') : t('margins.group')}</th>
                    {by === 'product' && <th className="px-3 py-2.5 text-right font-medium">{t('writeOff.qty')}</th>}
                    <th className="px-3 py-2.5 text-right font-medium">{t('sales.turnover')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('margins.net')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('sales.cost')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('sales.profit')}</th>
                    <th className="px-4 py-2.5 text-right font-medium sm:px-5">{t('margins.margin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id ?? `none-${row.name}`} className={tableRowClass()}>
                      <td className="px-4 py-2.5 sm:px-5">
                        <p className="font-display text-[0.84rem] text-ops-ink">{row.id === null && by === 'group' ? t('margins.noGroup') : row.name}</p>
                        {row.code && <p className="font-mono text-[0.66rem] text-slate-400">{row.code}</p>}
                      </td>
                      {by === 'product' && <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] tabular-nums">{qtyFormat.format(row.quantity)}</td>}
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] tabular-nums">{formatEuro(row.gross)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] text-slate-500 tabular-nums">{formatEuro(row.net)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] text-slate-500 tabular-nums">
                        {row.cost !== undefined ? formatEuro(row.cost) : '—'}
                        {row.linesWithoutCost ? <span className="text-amber-700">*</span> : null}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right font-mono text-[0.82rem] font-medium tabular-nums', (row.profit ?? 0) < 0 ? 'text-ops-danger' : 'text-ops-teal')}>
                        {row.profit !== undefined ? formatEuro(row.profit) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[0.8rem] tabular-nums sm:px-5">{marginText(row.marginPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassPanel>
    </div>
  );
};
