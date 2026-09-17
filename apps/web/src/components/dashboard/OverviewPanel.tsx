import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardList,
  Package,
  PackageMinus,
  Timer,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { formatEuro } from '../../lib/dashboard-data';
import { useTranslation } from 'react-i18next';
import { useDashboard } from './dashboard-context';
import {
  ActionButton,
  DaysPill,
  ExpiryChip,
  GhostButton,
  GlassPanel,
  LiveBadge,
  MetricCard,
  SpecularRim,
  StatusPill,
  glassClass,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';

export const OverviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, onScan, writeOff } = useDashboard();
  const firstWriteOff = data.fefoBoard[0];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label={t('overview.todaysSales')}
          value={formatEuro(0)}
          hint={t('overview.todaysSalesHint')}
          icon={TrendingUp}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label={t('overview.stockValue')}
          value={formatEuro(data.stockValue)}
          hint={t('overview.stockValueHint', { count: data.catalogCount })}
          icon={Package}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label={t('overview.pendingInvoices')}
          value={String(data.pending.length)}
          hint={data.pending.length === 1 ? t('overview.pendingOne') : t('overview.pendingMany', { count: data.pending.length })}
          icon={ClipboardList}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label={t('overview.expiring7')}
          value={String(data.expiring[7])}
          hint={t('overview.expiringHint')}
          icon={Timer}
          iconColor="text-ops-warn"
        />
      </section>

      <section className={cnPanel()}>
        <SpecularRim />
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-ops-warn" />
            <h2 className="font-display text-[0.92rem] font-semibold text-ops-ink">{t('overview.fefoBoard')}</h2>
          </div>
          <LiveBadge>{t('overview.liveRotation')}</LiveBadge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2.5">
          <ExpiryChip days={30} count={data.expiring[30]} active={data.expiring[30] > 0} subLabel={t('overview.safe')} />
          <ExpiryChip days={14} count={data.expiring[14]} active={data.expiring[14] > 0} subLabel={t('overview.notice')} />
          <ExpiryChip days={7} count={data.expiring[7]} active={data.expiring[7] > 0} subLabel={t('overview.urgent')} />
          <ExpiryChip days={3} count={data.expiring[3]} active={data.expiring[3] > 0} subLabel={t('overview.critical')} />
        </div>
        {data.lowStock.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-[0.7rem] font-medium tracking-wider text-slate-500 uppercase">{t('overview.minStockAlerts')}</span>
            {data.lowStock.slice(0, 4).map((line) => (
              <span
                key={`${line.sku}-${line.batch}`}
                className="flex items-center gap-1.5 rounded-full border border-ops-danger/15 bg-rose-50 px-2.5 py-0.5 font-sans text-[0.72rem] text-ops-ink"
              >
                <span className="size-1 rounded-full bg-ops-danger" />
                <span>{line.name}</span>
                <span className="font-mono text-slate-500">
                  ({line.qty}/{line.minStock})
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-2 sm:gap-2.5">
        <ActionButton icon={Camera} label={t('app.photographInvoice')} onClick={onScan} primary />
        <ActionButton icon={Truck} label={t('overview.receiveGoods')} onClick={() => navigate('/app/invoices/new')} />
        <ActionButton
          icon={PackageMinus}
          label={t('overview.writeOff')}
          onClick={() => (firstWriteOff ? writeOff(firstWriteOff.sku, firstWriteOff.batch) : navigate('/app/expiry'))}
        />
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <GlassPanel
          padded={false}
          title={t('overview.expiringSoon')}
          action={
            <button
              type="button"
              onClick={() => navigate('/app/expiry')}
              className="inline-flex items-center gap-1 font-display text-[0.75rem] font-medium text-ops-accent transition-colors hover:text-ops-ink"
            >
              {t('overview.openExpiry')}
              <ArrowRight size={13} />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-display font-medium">{t('overview.itemSku')}</th>
                  <th className="px-3 py-2.5 font-display font-medium">{t('overview.batch')}</th>
                  <th className="px-3 py-2.5 font-display font-medium">{t('overview.expires')}</th>
                  <th className="px-4 py-2.5 text-right font-display font-medium">{t('overview.action')}</th>
                </tr>
              </thead>
              <tbody>
                {data.fefoBoard.slice(0, 6).map((line) => (
                  <tr key={`${line.sku}-${line.batch}`} className={tableRowClass()}>
                    <td className="px-4 py-3">
                      <p className="font-display text-[0.82rem] font-medium text-ops-ink">{line.name}</p>
                      <p className="font-mono text-[0.66rem] text-slate-500">{line.sku}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.75rem] text-slate-600">{line.batch}</td>
                    <td className="px-3 py-3">
                      <DaysPill days={line.daysLeft} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <GhostButton onClick={() => writeOff(line.sku, line.batch)}>{t('overview.writeOff')}</GhostButton>
                    </td>
                  </tr>
                ))}
                {data.fefoBoard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center font-sans text-[0.8rem] text-slate-500">
                      {t('empty.noExpiry')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassPanel>

        <GlassPanel
          padded={false}
          title={t('overview.recentOps')}
          action={
            <button
              type="button"
              onClick={() => navigate('/app/invoices')}
              className="inline-flex items-center gap-1 font-display text-[0.75rem] font-medium text-ops-accent transition-colors hover:text-ops-ink"
            >
              <ClipboardList size={13} />
              {t('overview.invoices')}
            </button>
          }
        >
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
                  <tr key={op.id} className={tableRowClass()}>
                    <td className="px-4 py-3 font-sans text-[0.8rem] text-ops-ink">{t(`labels.documentType.${op.type}`)}</td>
                    <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-500">{op.document}</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-slate-400">{op.time}</td>
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
      </section>
    </div>
  );
};

function cnPanel() {
  return `${glassClass} p-4 sm:p-5`;
}
