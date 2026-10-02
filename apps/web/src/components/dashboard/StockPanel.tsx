import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Camera, ChevronRight, ClipboardCheck, PackageOpen, Search, ShoppingBasket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import type { StockLevel, StockLevelStatus } from '../../lib/workspace-api';
import { formatBusinessDateTime } from '../../lib/business-date';
import { formatDate, formatQty, asMoney } from '../../lib/format';
import { usePermissions } from '../../lib/permissions';
import { FRESH_DATA_MS } from '../../lib/pwa-constants';
import { useSiteChoices, useStockQuery } from '../../lib/workspace-session';
import { useDashboard } from './dashboard-context';
import { daysUntil, formatEuro } from '../../lib/dashboard-data';
import { ActionButton, DaysPill, GlassPanel, LiveBadge, PageHeader } from './dashboard-ui';

/** SKL-18: ON_HAND = stock > 0 (panel title „Налично“); LOW/OUT keep status buckets. */
type Filter = 'ALL' | 'ON_HAND' | Exclude<StockLevelStatus, 'OK'>;

const BATCHES_SHOWN = 3;

function matches(item: StockLevel, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(needle) ||
    item.code.toLowerCase().includes(needle) ||
    item.barcodes.some((barcode) => barcode.includes(needle))
  );
}

export const StockPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { siteId, onScan } = useDashboard();
  const { createDocuments, openingStock, stockOps, seeFinancials } = usePermissions();
  const { sites } = useSiteChoices();
  const stockQuery = useStockQuery(siteId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  const siteName = sites.find((site) => site.id === siteId)?.name ?? '';
  const servedAt = stockQuery.data?.servedAt;
  const savedCopy = servedAt && Date.now() - Date.parse(servedAt) > FRESH_DATA_MS ? servedAt : null;
  const items = useMemo(() => stockQuery.data?.items ?? [], [stockQuery.data]);
  const counts = useMemo(
    () => ({
      ALL: items.length,
      ON_HAND: items.filter((item) => item.onHand > 0).length,
      LOW: items.filter((item) => item.status === 'LOW').length,
      OUT: items.filter((item) => item.status === 'OUT').length,
    }),
    [items],
  );
  const query = search.trim();
  const visible = items.filter((item) => {
    if (!matches(item, query)) return false;
    if (filter === 'ALL') return true;
    if (filter === 'ON_HAND') return item.onHand > 0;
    return item.status === filter;
  });
  const totalValue = visible.reduce((sum, item) => sum + asMoney(item.value), 0);

  const filters: { id: Filter; label: string }[] = [
    { id: 'ALL', label: t('stock.all') },
    { id: 'ON_HAND', label: t('stock.onHand') },
    { id: 'LOW', label: t('stock.low') },
    { id: 'OUT', label: t('stock.out') },
  ];

  const actions = [
    { to: '/app/transfer', label: t('app.transfer'), icon: ArrowLeftRight, show: stockOps },
    { to: '/app/stocktake', label: t('app.stocktake'), icon: ClipboardCheck, show: stockOps },
    { to: '/app/reorder', label: t('app.reorder'), icon: ShoppingBasket, show: true },
    { to: '/app/opening-stock', label: t('app.openingStock'), icon: PackageOpen, show: openingStock },
  ].filter((action) => action.show);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <PageHeader
        eyebrow={siteName || undefined}
        title={t('stock.title')}
        description={t('stock.desc')}
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {actions.map((action) => (
          <button
            key={action.to}
            type="button"
            onClick={() => navigate(action.to)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-display text-[0.78rem] font-medium text-ops-ink shadow-sm hover:border-ops-accent/30 active:scale-[0.98]"
          >
            <action.icon size={15} className="text-ops-accent" />
            {action.label}
          </button>
        ))}
      </div>

      {savedCopy && (
        <p className="rounded-xl border border-ops-warn/25 bg-orange-50 px-3.5 py-2.5 font-sans text-[0.78rem] text-ops-warn" data-testid="stock-saved-copy">
          {t('stock.savedCopy', { time: formatBusinessDateTime(savedCopy, i18n.language) })}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <label className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('stock.search')}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-10 font-sans text-[0.9rem] text-ops-ink shadow-sm outline-none focus:border-ops-teal/50"
          />
        </label>
        <div className="flex gap-2">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[0.76rem] font-medium transition-all active:scale-95',
                filter === option.id
                  ? 'border-ops-accent/25 bg-indigo-50 text-ops-accent'
                  : 'border-slate-200 bg-white text-slate-500 hover:text-ops-ink',
              )}
            >
              {option.label}
              <span
                className={cn(
                  'rounded-full px-1.5 font-mono text-[0.68rem]',
                  option.id === 'OUT' && counts.OUT > 0 && 'bg-ops-danger/10 text-ops-danger',
                  option.id === 'LOW' && counts.LOW > 0 && 'bg-ops-warn/10 text-ops-warn',
                )}
              >
                {counts[option.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <GlassPanel
        padded={false}
        title={filter === 'ON_HAND' || filter === 'ALL' ? t('stock.onHand') : t('stock.title')}
        action={
          <LiveBadge>
            {seeFinancials
              ? `${t('stock.products', { count: filter === 'ALL' ? counts.ON_HAND : visible.length })} · ${formatEuro(totalValue)}`
              : t('stock.products', { count: filter === 'ALL' ? counts.ON_HAND : visible.length })}
          </LiveBadge>
        }
      >
        {!siteId ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('stock.noSite')}</p>
        ) : stockQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('stock.loading')}</p>
        ) : stockQuery.isError ? (
          <p className="px-5 py-8 font-sans text-sm text-ops-danger">{t('stock.loadFailed')}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-5 py-8">
            <p className="max-w-md font-sans text-sm text-slate-500">{t('stock.empty')}</p>
            {createDocuments && (
              <div className="flex flex-wrap gap-2">
                <ActionButton icon={Camera} label={t('app.photographInvoice')} onClick={onScan} primary />
                {openingStock && (
                  <ActionButton icon={PackageOpen} label={t('app.openingStock')} onClick={() => navigate('/app/opening-stock')} />
                )}
              </div>
            )}
            {!createDocuments && openingStock && (
              <ActionButton icon={PackageOpen} label={t('app.openingStock')} onClick={() => navigate('/app/opening-stock')} />
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('stock.noMatches')}</p>
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.productId} className="border-b border-slate-100 last:border-0">
                <button
                  type="button"
                  onClick={() => navigate(`/app/stock/${item.productId}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ops-canvas/70 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-[0.92rem] font-medium text-ops-ink">{item.name}</p>
                    <p className="mt-0.5 truncate font-mono text-[0.68rem] text-slate-400">
                      {item.code}
                      {item.lastMovementAt
                        ? ` · ${t('stock.lastMoved', { date: formatDate(item.lastMovementAt.slice(0, 10), i18n.language) })}`
                        : ''}
                    </p>
                    {item.status === 'OUT' && (
                      <p className="mt-1 font-display text-[0.7rem] font-medium text-ops-danger">{t('stock.outOfStock')}</p>
                    )}
                    {item.status === 'LOW' && (
                      <p className="mt-1 font-display text-[0.7rem] font-medium text-ops-warn">
                        {t('stock.belowMin', { min: formatQty(item.minStock, i18n.language) })}
                      </p>
                    )}
                    {item.batches.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.batches.slice(0, BATCHES_SHOWN).map((batch) => (
                          <li
                            key={batch.batchId}
                            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-ops-canvas px-1.5 py-0.5 font-mono text-[0.66rem] text-slate-600"
                          >
                            {batch.expiryDate && <DaysPill days={daysUntil(batch.expiryDate)} />}
                            <span>{batch.batchNumber}</span>
                            {batch.isAutomatic && (
                              <span className="rounded bg-slate-200/80 px-1 py-px font-display text-[0.58rem] font-medium tracking-wide text-slate-600 uppercase">
                                {t('stock.autoBatch')}
                              </span>
                            )}
                            <span className="text-ops-ink">{formatQty(batch.onHand, i18n.language)}</span>
                          </li>
                        ))}
                        {item.batches.length > BATCHES_SHOWN && (
                          <li className="px-1 py-0.5 font-mono text-[0.66rem] text-slate-400">
                            {t('stock.moreBatches', { count: item.batches.length - BATCHES_SHOWN })}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p
                        className={cn(
                          'font-display text-[1.5rem] leading-none font-semibold tabular-nums',
                          item.status === 'OUT' ? 'text-ops-danger' : item.status === 'LOW' ? 'text-ops-warn' : 'text-ops-ink',
                        )}
                      >
                        {formatQty(item.onHand, i18n.language)}
                      </p>
                      <p className="mt-1 font-sans text-[0.72rem] text-slate-400">{t(`labels.unit.${item.unit}`)}</p>
                      {seeFinancials && asMoney(item.value) > 0 && (
                        <p className="font-mono text-[0.68rem] text-slate-500">{formatEuro(asMoney(item.value))}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
};
