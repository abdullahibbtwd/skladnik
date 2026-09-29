import React, { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, PackageMinus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { daysUntil, formatEuro } from '../../lib/dashboard-data';
import { usePermissions } from '../../lib/permissions';
import { documentPath, type StockMovementRecord } from '../../lib/workspace-api';
import { useMovementsQuery, useSitesQuery, useStockQuery } from '../../lib/workspace-session';
import { useDashboard } from './dashboard-context';
import {
  ActionButton,
  DaysPill,
  GhostButton,
  GlassPanel,
  LiveBadge,
  MetricCard,
  MetricGrid,
  PageHeader,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';

export const MovementHistoryPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get('batchId') ?? undefined;
  const { siteId } = useDashboard();
  const { createDocuments } = usePermissions();
  const sitesQuery = useSitesQuery();
  const stockQuery = useStockQuery(siteId);
  const movementsQuery = useMovementsQuery(siteId, productId, batchId);
  const data = movementsQuery.data;

  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);
  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const level = stockQuery.data?.items.find((item) => item.productId === productId);
  const unit = data ? t(`labels.unit.${data.product.unit}`) : '';
  const selectedBatch = data?.batches.find((batch) => batch.batchId === batchId);
  const onHand = selectedBatch ? selectedBatch.onHand : (data?.onHand ?? 0);
  const unitCost = selectedBatch
    ? level?.batches.find((batch) => batch.batchId === batchId)?.unitCost ?? null
    : (level?.avgCost ?? null);

  const describe = (movement: StockMovementRecord) => {
    const doc = movement.document;
    if (!doc) return { title: t('history.noDocument'), detail: '' };
    const title = doc.writeOffReason
      ? `${t('writeOff.eyebrow')} · ${t(`labels.writeOffReason.${doc.writeOffReason}`)}`
      : doc.type === 'STOCKTAKE'
        ? movement.direction === 'IN'
          ? t('history.stocktakeSurplus')
          : t('history.stocktakeShortage')
        : doc.type === 'SALE' && doc.reversal
          ? t('history.saleVoid')
          : t(`labels.documentType.${doc.type}`);
    const detail = doc.counterpartSite
      ? `${movement.direction === 'OUT' ? '→' : '←'} ${doc.counterpartSite.name}`
      : (doc.partner?.name ?? '');
    return { title, detail };
  };

  const itemParams = new URLSearchParams({ productId: productId ?? '', ...(batchId ? { batchId } : {}) });

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={`${t('history.eyebrow')}${siteName ? ` · ${siteName}` : ''}`}
        title={data?.product.name ?? level?.name ?? t('history.title')}
        description={data ? `${data.product.code}${selectedBatch ? ` · ${t('writeOff.batch')} ${selectedBatch.batchNumber}` : ''}` : ''}
        action={
          <GhostButton onClick={() => navigate('/app/stock')}>
            <span className="inline-flex items-center gap-1">
              <ArrowLeft size={13} /> {t('history.backToStock')}
            </span>
          </GhostButton>
        }
      />

      <MetricGrid columns={3}>
        <MetricCard
          label={t('stock.onHand')}
          value={data ? `${qtyFormat.format(onHand)} ${unit}` : '—'}
          hint={selectedBatch ? t('history.thisBatch') : t('history.allBatches')}
          icon={PackageMinus}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label={t('history.unitCost')}
          value={unitCost === null ? '—' : formatEuro(unitCost)}
          hint={selectedBatch ? t('history.batchCost') : t('history.avgCost')}
          icon={PackageMinus}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label={t('history.value')}
          value={unitCost === null ? '—' : formatEuro(Math.max(0, onHand) * unitCost)}
          hint={t('stocktake.atCost')}
          icon={PackageMinus}
          iconColor="text-ops-teal"
        />
      </MetricGrid>

      {onHand > 0 && createDocuments && (
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={ArrowLeftRight} label={t('history.transfer')} onClick={() => navigate(`/app/transfer?${itemParams}`)} />
          <ActionButton icon={PackageMinus} label={t('history.writeOff')} onClick={() => navigate(`/app/write-off?${itemParams}`)} />
        </div>
      )}

      {data && data.batches.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            aria-pressed={!batchId}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 font-display text-[0.76rem] font-medium',
              !batchId ? 'border-ops-accent/25 bg-indigo-50 text-ops-accent' : 'border-slate-200 bg-white text-slate-500',
            )}
          >
            {t('history.allBatches')}
          </button>
          {data.batches.map((batch) => (
            <button
              key={batch.batchId}
              type="button"
              onClick={() => setSearchParams({ batchId: batch.batchId }, { replace: true })}
              aria-pressed={batchId === batch.batchId}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[0.72rem]',
                batchId === batch.batchId ? 'border-ops-accent/25 bg-indigo-50 text-ops-accent' : 'border-slate-200 bg-white text-slate-600',
              )}
            >
              {batch.expiryDate && <DaysPill days={daysUntil(batch.expiryDate)} />}
              {batch.batchNumber}
              <span className="text-slate-400">{qtyFormat.format(batch.onHand)}</span>
            </button>
          ))}
        </div>
      )}

      <GlassPanel
        padded={false}
        title={t('history.movements')}
        action={data ? <LiveBadge>{t('history.count', { count: data.movements.length })}</LiveBadge> : undefined}
      >
        {!siteId ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('stock.noSite')}</p>
        ) : movementsQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('stock.loading')}</p>
        ) : movementsQuery.isError ? (
          <p className="px-5 py-8 font-sans text-sm text-ops-danger">{movementsQuery.error.message}</p>
        ) : !data || data.movements.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('history.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('history.document')}</th>
                  <th className="px-3 py-2.5 text-right font-display font-medium">{t('history.change')}</th>
                  <th className="px-3 py-2.5 text-right font-display font-medium">{t('history.cost')}</th>
                  <th className="px-4 py-2.5 text-right font-display font-medium sm:px-5">{t('history.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((movement) => {
                  const { title, detail } = describe(movement);
                  const doc = movement.document;
                  return (
                    <tr
                      key={movement.id}
                      className={cn(tableRowClass(), doc && 'cursor-pointer')}
                      onClick={doc ? () => navigate(documentPath({ id: doc.id, type: doc.type })) : undefined}
                    >
                      <td className="px-4 py-2.5 sm:px-5">
                        <p className="font-display text-[0.82rem] text-ops-ink">{title}</p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {movement.occurredAt}
                          {doc ? ` · ${doc.number}` : ''}
                          {detail ? ` · ${detail}` : ''}
                          {!batchId && movement.batch ? ` · ${movement.batch.batchNumber}` : ''}
                        </p>
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right font-mono text-[0.84rem] font-medium whitespace-nowrap',
                          movement.direction === 'IN' ? 'text-ops-teal' : 'text-ops-danger',
                        )}
                      >
                        {movement.direction === 'IN' ? '+' : '−'}
                        {qtyFormat.format(movement.quantity)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.74rem] whitespace-nowrap text-slate-500">
                        {movement.unitCost === null ? '—' : formatEuro(movement.unitCost)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[0.84rem] whitespace-nowrap text-ops-ink sm:px-5">
                        {qtyFormat.format(movement.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.truncated && <p className="px-5 py-3 font-sans text-[0.74rem] text-slate-500">{t('history.truncated')}</p>}
          </div>
        )}
      </GlassPanel>
    </div>
  );
};
