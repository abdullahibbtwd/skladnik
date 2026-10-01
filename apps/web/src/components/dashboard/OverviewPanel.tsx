import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardList,
  FileCode2,
  FileSpreadsheet,
  Landmark,
  Package,
  PackageMinus,
  ShoppingCart,
  Timer,
  Truck,
  Wallet,
} from 'lucide-react';
import { businessToday } from '../../lib/business-date';
import { formatEuro } from '../../lib/dashboard-data';
import { useAuthRole, useRequiredUser } from '../../lib/auth-store';
import { usePermissions } from '../../lib/permissions';
import { documentPath } from '../../lib/workspace-api';
import { useSalesReportQuery } from '../../lib/workspace-session';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { useDashboard } from './dashboard-context';
import { ExpiringBatches } from './ExpiringBatches';
import { ActionButton, desktopTableWrapClass, GlassPanel, MetricCard, mobileCardClass, mobileCardListClass, StatusPill, tableHeadRowClass, tableRowClass } from './dashboard-ui';

const USE_FIRST_LIMIT = 6;
const RUNNING_LOW_LIMIT = 5;

export const OverviewPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useRequiredUser();
  const role = useAuthRole();
  const { data, siteId, onScan, startDocument } = useDashboard();
  const { createDocuments, seeFinancials, pos, reports, vat, audit, salesRead } = usePermissions();
  const today = businessToday();
  const todaySales = useSalesReportQuery(salesRead ? siteId : '', today, today).data?.summary;
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);

  const ready = data.stockReady;
  const dash = '—';
  const myPending = useMemo(
    () => data.pending.filter((doc) => doc.createdById === user.id),
    [data.pending, user.id],
  );
  const expiringPullCount = data.expired + (data.useFirstBoard?.length ?? 0);

  const openLink = (to: string, label: string) => (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="inline-flex max-w-[10rem] items-center gap-1 font-display text-[0.75rem] font-medium text-ops-accent transition-colors hover:text-ops-ink"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ArrowRight size={13} className="shrink-0" />
    </button>
  );

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="hidden flex-wrap gap-2.5 md:flex">
        {/* ACC-01: Accountant quick actions → Справки / ДДС / Одит (no write ops). */}
        {role === 'ACCOUNTANT' && (
          <>
            {reports && <ActionButton icon={FileSpreadsheet} label={t('app.reports')} onClick={() => navigate('/app/reports')} primary />}
            {vat && <ActionButton icon={Landmark} label={t('app.vat')} onClick={() => navigate('/app/vat')} />}
            {audit && <ActionButton icon={FileCode2} label={t('app.audit')} onClick={() => navigate('/app/audit')} />}
          </>
        )}
        {createDocuments && role === 'STAFF' && (
          <>
            {/* SKL-16: Staff quick actions — five buttons, no till. */}
            <ActionButton icon={Camera} label={t('app.photographInvoice')} onClick={onScan} primary />
            <ActionButton icon={Truck} label={t('overview.receiveGoods')} onClick={() => startDocument('RECEIPT')} />
            <ActionButton icon={Package} label={t('overview.checkStock')} onClick={() => navigate('/app/stock')} />
            <ActionButton icon={Timer} label={t('overview.expiringSoon')} onClick={() => navigate('/app/expiry')} />
            <ActionButton icon={PackageMinus} label={t('overview.writeOff')} onClick={() => startDocument('WRITE_OFF')} />
          </>
        )}
        {createDocuments && role !== 'STAFF' && role !== 'ACCOUNTANT' && (
          <>
            <ActionButton icon={Camera} label={t('app.photographInvoice')} onClick={onScan} primary />
            <ActionButton icon={Truck} label={t('overview.receiveGoods')} onClick={() => startDocument('RECEIPT')} />
            <ActionButton icon={PackageMinus} label={t('overview.writeOff')} onClick={() => startDocument('WRITE_OFF')} />
            {pos && <ActionButton icon={ShoppingCart} label={t('sales.openTill')} onClick={() => navigate('/app/pos')} />}
          </>
        )}
        {pos && !createDocuments && role !== 'ACCOUNTANT' && (
          <ActionButton icon={ShoppingCart} label={t('sales.openTill')} onClick={() => navigate('/app/pos')} primary />
        )}
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5 [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1">
        <MetricCard
          label={t('overview.useSoon', { count: data.expiring[2]?.days ?? 7 })}
          value={ready ? String(data.expiring[2]?.count ?? 0) : dash}
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
        {seeFinancials ? (
          <MetricCard
            label={t('overview.pendingInvoices')}
            value={String(data.pending.length)}
            hint={t('overview.pendingHint', { count: data.pending.length })}
            icon={ClipboardList}
            iconColor="text-ops-accent"
            onClick={() => navigate('/app/invoices')}
          />
        ) : (
          <MetricCard
            label={t('overview.myPendingDocs')}
            value={String(myPending.length)}
            hint={t('overview.myPendingHint', { count: myPending.length })}
            icon={ClipboardList}
            iconColor="text-ops-accent"
            onClick={() => navigate('/app/invoices')}
          />
        )}
        {seeFinancials ? (
          <MetricCard
            label={t('overview.stockValue')}
            value={ready ? formatEuro(data.stockValue) : dash}
            hint={t('overview.stockValueHint', { count: data.inStockCount })}
            icon={Package}
            iconColor="text-ops-teal"
            onClick={() => navigate('/app/stock')}
          />
        ) : (
          <MetricCard
            label={t('overview.expiringPull')}
            value={ready ? String(expiringPullCount) : dash}
            hint={t('overview.expiringPullHint')}
            icon={Package}
            iconColor="text-ops-teal"
            onClick={() => navigate('/app/expiry')}
          />
        )}
        {seeFinancials && (
          <MetricCard
            label={t('overview.salesToday')}
            value={todaySales ? formatEuro(todaySales.turnover) : dash}
            hint={todaySales ? t('sales.receiptCount', { count: todaySales.tickets }) : t('overview.salesTodayHint')}
            icon={Wallet}
            iconColor="text-ops-teal"
            onClick={() => navigate('/app/sales')}
          />
        )}
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <GlassPanel padded={false} title={t('overview.useFirst')} action={openLink('/app/expiry', t('overview.openExpiry'))}>
          <ExpiringBatches
            lines={data.useFirstBoard.slice(0, USE_FIRST_LIMIT)}
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
            {data.operations.length === 0 ? (
              <p className="px-4 py-8 text-center font-sans text-[0.8rem] text-slate-500 sm:px-5">{t('empty.noOps')}</p>
            ) : (
              <>
                <ul className={mobileCardListClass()}>
                  {data.operations.map((op) => (
                    <li key={op.id}>
                      <button
                        type="button"
                        onClick={() => navigate(documentPath(op))}
                        className={`${mobileCardClass()} w-full cursor-pointer text-left transition-colors hover:bg-ops-canvas/70`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-display text-[0.86rem] font-medium text-ops-ink">
                              {t(`labels.documentType.${op.type}`)}
                              {op.writeOffReason && ` · ${t(`labels.writeOffReason.${op.writeOffReason}`)}`}
                            </p>
                            <p className="font-mono text-[0.72rem] text-slate-500">
                              {op.document} · {op.date.today ? t('expiry.today') : op.date.label}
                            </p>
                          </div>
                          <StatusPill status={op.status} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={desktopTableWrapClass()}>
                  <table className="w-full text-left">
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
                            {t(`labels.documentType.${op.type}`)}
                            {op.writeOffReason && ` · ${t(`labels.writeOffReason.${op.writeOffReason}`)}`}
                          </td>
                          <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-500">{op.document}</td>
                          <td className="px-3 py-3 font-mono text-[0.72rem] text-slate-400">{op.date.today ? t('expiry.today') : op.date.label}</td>
                          <td className="px-4 py-3 text-right">
                            <StatusPill status={op.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </GlassPanel>
        </div>
      </section>
    </div>
  );
};
