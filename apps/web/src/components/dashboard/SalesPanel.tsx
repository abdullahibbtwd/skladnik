import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Percent, Receipt, ShoppingCart, TrendingUp, Undo2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSalesManager } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { businessToday, formatBusinessTime, formatDay, shiftDate } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import type { SalesSummary } from '../../lib/workspace-api';
import { useSalesQuery, useSalesReportQuery, useSitesQuery } from '../../lib/workspace-session';
import { DateField } from '../ui/DateField';
import { useDashboard } from './dashboard-context';
import { ActionButton, GlassPanel, LiveBadge, MetricCard, MetricGrid, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';

const OPEN_HOURS = { from: 7, to: 21 };

function PaymentSplit({ summary }: { summary: SalesSummary }) {
  const { t } = useTranslation();
  const cash = summary.payments.CASH;
  const card = summary.payments.CARD;
  const sum = cash.amount + card.amount;
  const cashShare = sum > 0 ? Math.round((cash.amount / sum) * 100) : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {sum > 0 && <div className="bg-ops-teal" style={{ width: `${cashShare}%` }} />}
        {sum > 0 && <div className="flex-1 bg-ops-accent" />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([
          ['CASH', cash, Banknote, 'text-ops-teal'],
          ['CARD', card, CreditCard, 'text-ops-accent'],
        ] as const).map(([method, row, Icon, color]) => (
          <div key={method} className="rounded-xl border border-slate-100 bg-ops-canvas/60 px-3 py-2.5">
            <p className="flex items-center gap-1.5 font-display text-[0.74rem] font-medium text-slate-500">
              <Icon size={14} className={color} />
              {t(`labels.paymentMethod.${method}`)}
            </p>
            <p className="mt-1 font-display text-[1.05rem] font-semibold text-ops-ink tabular-nums">{formatEuro(row.amount)}</p>
            <p className="font-sans text-[0.7rem] text-slate-400">{t('sales.receiptCount', { count: row.count })}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HourStrip({ summary }: { summary: SalesSummary }) {
  const { t } = useTranslation();
  const byHour = new Map(summary.hours.map((row) => [row.hour, row]));
  const first = Math.min(OPEN_HOURS.from, ...summary.hours.map((row) => row.hour));
  const last = Math.max(OPEN_HOURS.to, ...summary.hours.map((row) => row.hour));
  const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const peak = Math.max(1, ...summary.hours.map((row) => row.amount));
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {hours.map((hour) => {
          const row = byHour.get(hour);
          const amount = Math.max(0, row?.amount ?? 0);
          return (
            <div
              key={hour}
              title={`${String(hour).padStart(2, '0')}:00 · ${formatEuro(row?.amount ?? 0)} · ${t('sales.receiptCount', { count: row?.count ?? 0 })}`}
              className={cn('flex-1 rounded-t-sm', amount > 0 ? 'bg-ops-accent/70' : 'bg-slate-100')}
              style={{ height: `${Math.max(4, (amount / peak) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-slate-400">
        <span>{String(first).padStart(2, '0')}:00</span>
        <span>{String(last).padStart(2, '0')}:00</span>
      </div>
    </div>
  );
}

export const SalesPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthRole();
  const manager = isSalesManager(role);
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const today = businessToday();
  const requested = searchParams.get('date');
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const reportQuery = useSalesReportQuery(siteId, date, date);
  const salesQuery = useSalesQuery(siteId, date);

  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const summary = reportQuery.data?.summary;
  const sales = salesQuery.data?.sales ?? [];
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);

  const setDate = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === today) params.delete('date');
    else params.set('date', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader
        eyebrow={siteName || undefined}
        title={t('sales.title')}
        description={t('sales.desc')}
        action={
          <div className="flex gap-2">
            {manager && <ActionButton icon={Percent} label={t('app.margins')} onClick={() => navigate('/app/sales/margins')} />}
            <ActionButton icon={ShoppingCart} label={t('sales.openTill')} onClick={() => navigate('/app/pos')} primary />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, -1))}
          className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-ops-accent/30"
          aria-label={t('sales.prevDay')}
        >
          <ChevronLeft size={17} />
        </button>
        <DateField
          value={date}
          max={today}
          onChange={(value) => value && setDate(value)}
          aria-label={t('sales.day')}
          className="w-40"
        />
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          disabled={date >= today}
          className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-ops-accent/30 disabled:opacity-40"
          aria-label={t('sales.nextDay')}
        >
          <ChevronRight size={17} />
        </button>
        <span className="ml-1 font-display text-[0.86rem] font-medium text-slate-600">
          {date === today ? t('sales.today') : formatDay(date, i18n.language)}
        </span>
        <div className="ml-auto flex gap-2 md:hidden">
          {manager && <ActionButton icon={Percent} label={t('app.margins')} onClick={() => navigate('/app/sales/margins')} />}
          <ActionButton icon={ShoppingCart} label={t('sales.openTill')} onClick={() => navigate('/app/pos')} primary />
        </div>
      </div>

      {reportQuery.isError && (
        <p className="font-sans text-[0.84rem] text-ops-danger">{reportQuery.error.message}</p>
      )}

      <MetricGrid>
        <MetricCard
          label={t('sales.turnover')}
          value={summary ? formatEuro(summary.turnover) : '—'}
          hint={summary ? t('sales.turnoverHint', { net: formatEuro(summary.net), vat: formatEuro(summary.vat) }) : ''}
          icon={Wallet}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label={t('sales.tickets')}
          value={summary ? String(summary.tickets) : '—'}
          hint={summary ? t('sales.voidsHint', { count: summary.voids.count, amount: formatEuro(summary.voids.amount) }) : ''}
          icon={Receipt}
        />
        <MetricCard
          label={t('sales.averageTicket')}
          value={summary ? formatEuro(summary.averageTicket) : '—'}
          hint={t('sales.averageHint')}
          icon={TrendingUp}
        />
        {manager ? (
          <MetricCard
            label={t('sales.profit')}
            value={summary?.profit !== undefined ? formatEuro(summary.profit) : '—'}
            hint={
              summary?.marginPercent !== undefined && summary.marginPercent !== null
                ? t('sales.marginHint', { percent: summary.marginPercent.toFixed(1) })
                : t('sales.noMargin')
            }
            icon={Percent}
            iconColor={summary?.profit !== undefined && summary.profit < 0 ? 'text-ops-danger' : 'text-ops-teal'}
          />
        ) : (
          <MetricCard
            label={t('sales.voids')}
            value={summary ? String(summary.voids.count) : '—'}
            hint={summary ? formatEuro(summary.voids.amount) : ''}
            icon={Undo2}
            iconColor="text-ops-warn"
          />
        )}
      </MetricGrid>
      {manager && summary?.linesWithoutCost ? (
        <p className="-mt-2 font-sans text-[0.74rem] text-amber-700">{t('sales.linesWithoutCost', { count: summary.linesWithoutCost })}</p>
      ) : null}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <GlassPanel padded={false} title={t('sales.receiptsTitle')} action={<LiveBadge>{sales.length}</LiveBadge>}>
          {salesQuery.isLoading ? (
            <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('common.loading')}</p>
          ) : sales.length === 0 ? (
            <p className="px-4 py-8 text-center font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('sales.noSales')}</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-medium sm:px-5">{t('sales.receipt')}</th>
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell">{t('sales.cashier')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('pos.paymentMethod')}</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">{t('pos.total')}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => navigate(`/app/sales/${sale.id}`)}
                    className={cn(tableRowClass(), 'cursor-pointer', (sale.kind === 'VOID' || sale.voidedBy) && 'text-slate-400')}
                  >
                    <td className="px-4 py-2.5 sm:px-5">
                      <p className={cn('font-mono text-[0.8rem]', sale.voidedBy && 'line-through')}>{sale.number}</p>
                      <p className="font-sans text-[0.7rem] text-slate-400">
                        {formatBusinessTime(sale.postedAt, i18n.language)} · {t('sales.lineCount', { count: sale.lineCount })}
                        {sale.kind === 'VOID' && ` · ${t('sales.voidOf', { number: sale.reversalOf?.number ?? '' })}`}
                        {sale.voidedBy && ` · ${t('sales.voided')}`}
                      </p>
                    </td>
                    <td className="hidden px-3 py-2.5 font-sans text-[0.78rem] sm:table-cell">{sale.cashier?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 font-sans text-[0.78rem]">{sale.paymentMethod ? t(`labels.paymentMethod.${sale.paymentMethod}`) : '—'}</td>
                    <td className={cn('px-4 py-2.5 text-right font-mono text-[0.84rem] tabular-nums sm:px-5', sale.kind === 'VOID' ? 'text-ops-danger' : 'text-ops-ink')}>
                      {sale.kind === 'VOID' ? `−${formatEuro(sale.total)}` : formatEuro(sale.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassPanel>

        <div className="flex flex-col gap-4 sm:gap-5">
          <GlassPanel title={t('sales.paymentsTitle')}>{summary ? <PaymentSplit summary={summary} /> : <p className="text-slate-400">—</p>}</GlassPanel>
          <GlassPanel title={t('sales.byHourTitle')}>{summary ? <HourStrip summary={summary} /> : <p className="text-slate-400">—</p>}</GlassPanel>
          <GlassPanel padded={false} title={t('sales.topProducts')}>
            {!reportQuery.data || reportQuery.data.topProducts.length === 0 ? (
              <p className="px-4 py-5 font-sans text-[0.8rem] text-slate-500 sm:px-5">{t('sales.noSales')}</p>
            ) : (
              <ul>
                {reportQuery.data.topProducts.map((row) => (
                  <li key={row.id ?? row.name} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 sm:px-5">
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-display text-[0.82rem] text-ops-ink">{row.name}</span>
                      <span className="font-mono text-[0.66rem] text-slate-400">× {qtyFormat.format(row.quantity)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[0.82rem] text-ops-ink tabular-nums">{formatEuro(row.gross)}</span>
                      {row.profit !== undefined && (
                        <span className={cn('block font-mono text-[0.66rem] tabular-nums', row.profit < 0 ? 'text-ops-danger' : 'text-ops-teal')}>
                          {formatEuro(row.profit)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};
