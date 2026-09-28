import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Camera, ClipboardList, Package, PackageMinus, ShoppingCart, Timer, Truck, Wallet } from 'lucide-react';
import { businessToday } from '../../lib/business-date';
import { formatEuro } from '../../lib/dashboard-data';
import { documentPath } from '../../lib/workspace-api';
import { useSalesReportQuery } from '../../lib/workspace-session';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { useDashboard } from './dashboard-context';
import { ExpiringBatches } from './ExpiringBatches';
import { ActionButton, GlassPanel, MetricCard, StatusPill, tableHeadRowClass, tableRowClass } from './dashboard-ui';

const USE_FIRST_LIMIT = 6;
const RUNNING_LOW_LIMIT = 5;

export const OverviewPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, siteId, onScan, startDocument } = useDashboard();
  const today = businessToday();
  const todaySales = useSalesReportQuery(siteId, today, today).data?.summary;
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);

  const ready = data.stockReady;
  const dash = '—';

  const openLink = (to: string, label: string) => (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-1 font-display text-[0.75rem] font-medium text-ops-accent transition-colors hover:text-ops-ink"
    >
      {label}
      <ArrowRight size={13} />
    </button>
  );

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="hidden flex-wrap gap-2.5 lg:flex">
        <ActionButton icon={Camera} label={t('app.photographInvoice')} onClick={onScan} primary />
        <ActionButton icon={Truck} label={t('overview.receiveGoods')} onClick={() => startDocument('RECEIPT')} />
        <ActionButton icon={PackageMinus} label={t('overview.writeOff')} onClick={() => startDocument('PROTOCOL')} />
        <ActionButton icon={ShoppingCart} label={t('sales.openTill')} onClick={() => navigate('/app/pos')} />
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5 [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1">
        <MetricCard
          label={t('overview.useSoon')}
          value={ready ? String(data.expiring[7]) : dash}
          hint={data.expired > 0 ? t('overview.expiredHint', { count: data.expired }) : t('overview.useSoonHint')}
          icon={Timer}
          iconColor="text-ops-warn"
          onClick={() => navigate('/app/expiry')}
        />
        <MetricCard
          label={t('overview.lowOrOut')}
          value={ready ? String(data.lowStock.length) : dash}
          hint={t('overview.lowOrOutHint')}
          icon={AlertTriangle}
          iconColor="text-ops-danger"
          onClick={() => navigate('/app/stock')}
        />
        <MetricCard
          label={t('overview.pendingInvoices')}
          value={String(data.pending.length)}
          hint={t('overview.pendingHint', { count: data.pending.length })}
          icon={ClipboardList}
          iconColor="text-ops-accent"
          onClick={() => navigate('/app/invoices')}
        />
        <MetricCard
          label={t('overview.stockValue')}
          value={ready ? formatEuro(data.stockValue) : dash}
          hint={t('overview.stockValueHint', { count: data.inStockCount })}
          icon={Package}
          iconColor="text-ops-teal"
          onClick={() => navigate('/app/stock')}
        />
        <MetricCard
          label={t('overview.salesToday')}
          value={todaySales ? formatEuro(todaySales.turnover) : dash}
          hint={todaySales ? t('sales.receiptCount', { count: todaySales.tickets }) : t('overview.salesTodayHint')}
          icon={Wallet}
          iconColor="text-ops-teal"
          onClick={() => navigate('/app/sales')}
        />
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <GlassPanel padded={false} title={t('overview.useFirst')} action={openLink('/app/expiry', t('overview.openExpiry'))}>
          <ExpiringBatches
            lines={data.fefoBoard.slice(0, USE_FIRST_LIMIT)}
            empty={ready ? t('empty.noExpiry') : t('stock.loading')}
          />
        </GlassPanel>

        <div className="flex flex-col gap-4 sm:gap-5">
          <GlassPanel padded={false} title={t('overview.runningLow')} action={openLink('/app/stock', t('overview.openStock'))}>
            {data.lowStock.length === 0 ? (
              <p className="px-4 py-6 text-center font-sans text-[0.8rem] text-slate-500 sm:px-5">
                {ready ? t('overview.nothingLow') : t('stock.loading')}
              </p>
            ) : (
              <ul>
                {data.lowStock.slice(0, RUNNING_LOW_LIMIT).map((line) => (
                  <li
                    key={line.productId}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 sm:px-5"
                  >
                    <span className="min-w-0 truncate font-display text-[0.82rem] text-ops-ink">{line.name}</span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[0.76rem] tabular-nums',
                        line.qty <= 0 ? 'text-ops-danger' : 'text-ops-warn',
                      )}
                    >
                      {qtyFormat.format(line.qty)}
                      {line.minStock > 0 && <span className="text-slate-400"> / {qtyFormat.format(line.minStock)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel padded={false} title={t('overview.recentOps')} action={openLink('/app/invoices', t('overview.invoices'))}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-4 py-2.5 font-display font-medium">{t('common.type')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('overview.docRef')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('overview.time')}</th>
                    <th className="px-4 py-2.5 text-right font-display font-medium">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operations.map((op) => (
                    <tr
                      key={op.id}
                      className={cn(tableRowClass(), 'cursor-pointer')}
                      onClick={() => navigate(documentPath(op))}
                    >
                      <td className="px-4 py-3 font-sans text-[0.8rem] text-ops-ink">
                        {op.writeOffReason ? t(`labels.writeOffReason.${op.writeOffReason}`) : t(`labels.documentType.${op.type}`)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-500">{op.document}</td>
                      <td className="px-3 py-3 font-mono text-[0.72rem] text-slate-400">{op.date.today ? t('expiry.today') : op.date.label}</td>
                      <td className="px-4 py-3 text-right">
                        <StatusPill status={op.status} />
                      </td>
                    </tr>
                  ))}
                  {data.operations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center font-sans text-[0.8rem] text-slate-500">
                        {t('empty.noOps')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>
      </section>
    </div>
  );
};
