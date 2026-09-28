import React, { useMemo, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { daysUntil } from '../../lib/dashboard-data';
import type { StockBatch, StockLevel } from '../../lib/workspace-api';
import { FieldLabel } from '../PasswordField';
import { Select } from '../ui/Select';
import { GlassPanel } from './dashboard-ui';

export type PickedItem = { key: string; productId: string; batchId: string; qty: string };

export type PickedRow = {
  item: PickedItem;
  level: StockLevel | undefined;
  batch: StockBatch | undefined;
  qty: number;
  max: number;
  /** Cost per unit: the batch's own cost, else the site's moving average. */
  unitCost: number;
  expired: boolean;
  problem: string | null;
};

const SEARCH_LIMIT = 8;

export function availableQty(level: StockLevel, batchId: string) {
  if (!batchId) return level.onHand;
  return level.batches.find((batch) => batch.batchId === batchId)?.onHand ?? 0;
}

export function isExpired(batch: Pick<StockBatch, 'expiryDate'> | undefined) {
  return Boolean(batch?.expiryDate && daysUntil(batch.expiryDate) < 0);
}

export function pickedRows(
  items: PickedItem[],
  levelById: Map<string, StockLevel>,
  t: TFunction,
  qtyFormat: Intl.NumberFormat,
): PickedRow[] {
  return items.map((item) => {
    const level = levelById.get(item.productId);
    const batch = level?.batches.find((entry) => entry.batchId === item.batchId);
    const qty = Number(item.qty);
    const max = level ? availableQty(level, item.batchId) : 0;
    const problem = !level
      ? t('writeOff.notInStock')
      : !(qty > 0)
        ? t('writeOff.qtyRequired')
        : qty > max
          ? t('writeOff.onlyLeft', { qty: qtyFormat.format(max) })
          : null;
    const unitCost = batch?.unitCost ?? level?.avgCost ?? level?.purchasePrice ?? 0;
    return { item, level, batch, qty, max, unitCost, expired: isExpired(batch), problem };
  });
}

type Props = {
  title: string;
  levels: StockLevel[];
  rows: PickedRow[];
  setItems: React.Dispatch<React.SetStateAction<PickedItem[]>>;
  loading: boolean;
  disabled?: boolean;
  nothingInStock: string;
  /** Default new rows to the earliest batch that has not expired (FEFO for issuing). */
  preferUnexpired?: boolean;
  onSearchingChange?: (searching: boolean) => void;
};

export function newPickedItem(level: StockLevel, options: { batchId?: string; qty?: number; preferUnexpired?: boolean } = {}) {
  const fefo = options.preferUnexpired ? (level.batches.find((batch) => !isExpired(batch)) ?? level.batches[0]) : level.batches[0];
  const batchId = options.batchId ?? fefo?.batchId ?? '';
  return {
    key: `${level.productId}-${batchId}-${Date.now()}`,
    productId: level.productId,
    batchId,
    qty: String(options.qty ?? Math.min(1, availableQty(level, batchId))),
  };
}

export const StockItemPicker: React.FC<Props> = ({
  title,
  levels,
  rows,
  setItems,
  loading,
  disabled,
  nothingInStock,
  preferUnexpired,
  onSearchingChange,
}) => {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    [i18n.language],
  );

  const changeSearch = (value: string) => {
    setSearch(value);
    onSearchingChange?.(Boolean(value.trim()));
  };

  const query = search.trim().toLowerCase();
  const matches = query
    ? levels
        .filter(
          (level) =>
            level.name.toLowerCase().includes(query) ||
            level.code.toLowerCase().includes(query) ||
            level.barcodes.some((barcode) => barcode.includes(query)),
        )
        .slice(0, SEARCH_LIMIT)
    : [];

  const updateItem = (key: string, patch: Partial<PickedItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  return (
    <GlassPanel padded={false} title={title}>
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'start', behavior: 'smooth' })}
            placeholder={t('writeOff.searchPlaceholder')}
            disabled={disabled}
            className="w-full scroll-mt-24 rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-10 font-sans text-[0.9rem] text-ops-ink outline-none focus:border-ops-teal/50"
          />
        </label>
        {query && (
          <ul className="mt-2 overflow-hidden rounded-xl border border-slate-200">
            {matches.length === 0 ? (
              <li className="px-3 py-3 font-sans text-[0.8rem] text-slate-500">{t('writeOff.noMatches')}</li>
            ) : (
              matches.map((level) => (
                <li key={level.productId} className="border-b border-slate-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      setItems((current) => [...current, newPickedItem(level, { preferUnexpired })]);
                      changeSearch('');
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-indigo-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[0.84rem] text-ops-ink">{level.name}</span>
                      <span className="block truncate font-mono text-[0.66rem] text-slate-400">{level.code}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[0.76rem] text-slate-600">
                      {qtyFormat.format(level.onHand)} {t(`labels.unit.${level.unit}`)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">
          {loading ? t('stock.loading') : levels.length === 0 ? nothingInStock : t('writeOff.emptyItems')}
        </p>
      ) : (
        <ul>
          {rows.map(({ item, level, max, expired, problem }) => (
            <li key={item.key} className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3.5 last:border-0 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-display text-[0.88rem] font-medium text-ops-ink">{level?.name ?? '—'}</p>
                  {level && (
                    <p className="mt-0.5 font-mono text-[0.68rem] text-slate-500">
                      {t('writeOff.left', { qty: qtyFormat.format(max), unit: t(`labels.unit.${level.unit}`) })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-ops-danger"
                  aria-label={t('writeOff.removeItem')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2.5">
                {level && level.batches.length > 0 && (
                  <div className="min-w-[12rem] flex-1">
                    <FieldLabel htmlFor={`${item.key}-batch`}>{t('writeOff.batch')}</FieldLabel>
                    <Select
                      id={`${item.key}-batch`}
                      value={item.batchId}
                      onChange={(value) => updateItem(item.key, { batchId: value })}
                      options={level.batches.map((batch) => {
                        const when = batch.expiryDate
                          ? `${dateFormat.format(new Date(`${batch.expiryDate}T00:00:00Z`))}${isExpired(batch) ? ` · ${t('expiry.expired')}` : ''}`
                          : '';
                        return {
                          value: batch.batchId,
                          label: [batch.batchNumber, when, `${qtyFormat.format(batch.onHand)}`].filter(Boolean).join(' · '),
                        };
                      })}
                    />
                  </div>
                )}
                <div>
                  <FieldLabel htmlFor={`${item.key}-qty`}>{t('writeOff.qty')}</FieldLabel>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateItem(item.key, { qty: String(Math.max(0, Number(item.qty) - 1)) })}
                      className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                      aria-label="−1"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      id={`${item.key}-qty`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={item.qty}
                      onChange={(event) => updateItem(item.key, { qty: event.target.value })}
                      className="h-10 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-[0.9rem] text-ops-ink outline-none focus:border-ops-teal/50"
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(item.key, { qty: String(Number(item.qty) + 1) })}
                      className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                      aria-label="+1"
                    >
                      <Plus size={15} />
                    </button>
                    {max > 0 && Number(item.qty) !== max && (
                      <button
                        type="button"
                        onClick={() => updateItem(item.key, { qty: String(max) })}
                        className="ml-1 rounded-lg px-2 py-2 font-display text-[0.74rem] font-medium text-ops-accent hover:bg-indigo-50"
                      >
                        {t('writeOff.all')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {problem && <p className="font-display text-[0.72rem] font-medium text-ops-danger">{problem}</p>}
              {!problem && expired && preferUnexpired && (
                <p className="font-display text-[0.72rem] font-medium text-amber-700">{t('transfer.expiredBatch')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
};
