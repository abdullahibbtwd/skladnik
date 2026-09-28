import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Banknote, CheckCircle2, ChefHat, CreditCard, Minus, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSalesManager, type PaymentMethod } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { dishLevel, findByCode, newRequestId, parseAmount, planCart, batchExpired, type CartLine, type LinePlan } from '../../lib/till-cart';
import { ApiError, type StockLevel } from '../../lib/workspace-api';
import { useCreateSale, useMenuQuery, useSitesQuery, useStockQuery } from '../../lib/workspace-session';
import { FieldError } from '../PasswordField';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { BarcodeScanner, cameraScanSupported } from './BarcodeScanner';
import { useDashboard } from './dashboard-context';
import { ActionButton, GlassPanel, PageHeader } from './dashboard-ui';

const RESULT_LIMIT = 8;
const BROWSE_LIMIT = 24;
/** A USB / Bluetooth scanner types a whole code within a few ms per key, then Enter. */
const WEDGE_KEY_GAP_MS = 60;

type LastSale = { id: string; number: string; total: number; method: PaymentMethod; change: number | null };

function useBarcodeWedge(onScan: (code: string) => void) {
  const handler = useRef(onScan);
  handler.current = onScan;
  useEffect(() => {
    let buffer = '';
    let lastAt = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Inputs (including the search box) handle their own typing and Enter.
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const now = performance.now();
      if (now - lastAt > WEDGE_KEY_GAP_MS) buffer = '';
      lastAt = now;
      if (event.key === 'Enter') {
        if (buffer.length >= 3) {
          // Stops Enter from also pressing whatever button has focus.
          event.preventDefault();
          event.stopPropagation();
          handler.current(buffer);
        }
        buffer = '';
      } else if (event.key.length === 1) {
        buffer += event.key;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

function cashNotes(total: number) {
  const notes = [5, 10, 20, 50, 100, 200].filter((note) => note > total);
  return notes.slice(0, 3);
}

export const PosPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthRole();
  const manager = isSalesManager(role);
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const stockQuery = useStockQuery(siteId);
  const menuQuery = useMenuQuery(siteId);
  const createSale = useCreateSale();

  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const stockLevels = stockQuery.data?.items;
  const dishes = menuQuery.data?.dishes;
  const dishById = useMemo(() => new Map((dishes ?? []).map((dish) => [dish.id, dish])), [dishes]);
  const levelById = useMemo(() => new Map((stockLevels ?? []).map((level) => [level.productId, level])), [stockLevels]);
  // A product with a recipe is sold as a dish even if it once had stock of its own.
  const allLevels = useMemo(
    () => [...(stockLevels ?? []).filter((level) => !dishById.has(level.productId)), ...(dishes ?? []).map(dishLevel)],
    [stockLevels, dishes, dishById],
  );
  const levels = useMemo(() => allLevels.filter((level) => level.onHand > 0), [allLevels]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(newRequestId());

  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    [i18n.language],
  );

  // A changed cart is a different sale; only an unchanged retry may reuse the idempotency key.
  useEffect(() => {
    requestId.current = newRequestId();
  }, [cart, method]);

  useEffect(() => {
    setCart([]);
    setLastSale(null);
  }, [siteId]);

  const refocus = useCallback(() => {
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus();
  }, []);

  const plans = planCart(cart, levelById, dishById);
  const total = Math.round(plans.reduce((sum, plan) => sum + plan.total, 0) * 100) / 100;
  const itemCount = plans.reduce((sum, plan) => sum + (plan.qty > 0 ? 1 : 0), 0);
  const expiredPlans = plans.filter((plan) => plan.expired);
  const receivedAmount = parseAmount(received);
  const change = method === 'CASH' && receivedAmount >= total ? Math.round((receivedAmount - total) * 100) / 100 : null;
  const ready = cart.length > 0 && plans.every((plan) => !plan.problem) && Boolean(siteId);

  const addProduct = useCallback(
    (level: StockLevel) => {
      setLastSale(null);
      setError(null);
      setCart((current) => {
        const existing = current.find((line) => line.productId === level.productId && !line.batchId && line.price === null);
        if (existing) {
          return current.map((line) =>
            line.key === existing.key ? { ...line, qty: String(Math.round((parseAmount(line.qty) + 1) * 1000) / 1000) } : line,
          );
        }
        return [...current, { key: `${level.productId}-${Date.now()}`, productId: level.productId, qty: '1', batchId: '', price: null }];
      });
      setSearch('');
      refocus();
    },
    [refocus],
  );

  const handleCode = useCallback(
    (code: string) => {
      const level = findByCode(allLevels, code);
      if (!level) {
        toast.error(t('pos.unknownCode', { code }));
        return;
      }
      if (level.onHand <= 0) {
        toast.error(t('pos.outOfStock', { name: level.name }));
        return;
      }
      addProduct(level);
    },
    [allLevels, addProduct, t],
  );

  useBarcodeWedge(handleCode);

  const query = search.trim().toLowerCase();
  const matches = query
    ? levels
        .filter(
          (level) =>
            level.name.toLowerCase().includes(query) ||
            level.code.toLowerCase().includes(query) ||
            level.barcodes.some((barcode) => barcode.includes(query)),
        )
        .slice(0, RESULT_LIMIT)
    : [];
  const browse = useMemo(() => [...levels].sort((a, b) => a.name.localeCompare(b.name)).slice(0, BROWSE_LIMIT), [levels]);

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setCart((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) => setCart((current) => current.filter((line) => line.key !== key));

  const problemText = (plan: LinePlan) => {
    const unit = plan.level ? t(`labels.unit.${plan.level.unit}`) : '';
    switch (plan.problem?.kind) {
      case 'notInStock':
        return t('writeOff.notInStock');
      case 'qty':
        return t('writeOff.qtyRequired');
      case 'noPrice':
        return manager ? t('pos.noPriceManager') : t('pos.noPrice');
      case 'short':
        return plan.dish
          ? t('pos.onlyPortions', { count: plan.problem.available })
          : t('pos.onlyLeft', { qty: qtyFormat.format(plan.problem.available), unit });
      case 'ingredientShort':
        return t('pos.ingredientShort', {
          name: plan.problem.name,
          needed: qtyFormat.format(plan.problem.needed),
          available: qtyFormat.format(plan.problem.available),
          unit: t(`labels.unit.${plan.problem.unit}`),
        });
      default:
        return null;
    }
  };

  const charge = async (confirmExpired = false) => {
    if (!ready || createSale.isPending) return;
    setError(null);
    try {
      const result = await createSale.mutateAsync({
        siteId,
        paymentMethod: method,
        clientRequestId: requestId.current,
        confirmExpired,
        items: plans.map((plan) => ({
          productId: plan.line.productId,
          quantity: plan.qty,
          ...(plan.line.batchId ? { batchId: plan.line.batchId } : {}),
          ...(plan.line.price !== null ? { unitPrice: plan.unitPrice } : {}),
        })),
      });
      setLastSale({ id: result.sale.id, number: result.sale.number, total: result.sale.total, method, change });
      toast.success(t('pos.done', { number: result.sale.number, total: formatEuro(result.sale.total) }));
      setCart([]);
      setReceived('');
      setMethod('CASH');
      refocus();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXPIRED_CONFIRM') {
        const ok = await confirm({
          title: t('pos.expiredTitle'),
          description: `${err.warnings.join('. ')}. ${t('pos.expiredConfirm')}`,
          confirmLabel: t('pos.sellExpired'),
          danger: true,
        });
        if (ok) await charge(true);
        return;
      }
      setError(err instanceof Error ? err.message : t('pos.failed'));
    }
  };

  const confirmAndCharge = async () => {
    if (expiredPlans.length) {
      const ok = await confirm({
        title: t('pos.expiredTitle'),
        description: `${expiredPlans
          .map((plan) => (plan.dish ? t('pos.expiredIngredientOf', { name: plan.dish.name }) : plan.level?.name))
          .join(', ')}. ${t('pos.expiredConfirm')}`,
        confirmLabel: t('pos.sellExpired'),
        danger: true,
      });
      if (!ok) return;
      await charge(true);
      return;
    }
    await charge(false);
  };

  const batchLabel = (batch: { batchNumber: string; expiryDate: string | null; onHand: number }) => {
    const when = batch.expiryDate
      ? `${dateFormat.format(new Date(`${batch.expiryDate}T00:00:00Z`))}${batchExpired(batch) ? ` · ${t('expiry.expired')}` : ''}`
      : '';
    return [batch.batchNumber, when, qtyFormat.format(batch.onHand)].filter(Boolean).join(' · ');
  };

  const payButton = (
    <button
      type="button"
      onClick={() => void confirmAndCharge()}
      disabled={!ready || createSale.isPending}
      className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.92rem] font-semibold text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] transition-all hover:bg-ops-teal-hover active:scale-[0.98] disabled:opacity-50"
    >
      {method === 'CASH' ? <Banknote size={17} /> : <CreditCard size={17} />}
      {createSale.isPending ? t('common.saving') : t('pos.charge', { total: formatEuro(total) })}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 pb-44 sm:gap-5 lg:pb-0">
      <PageHeader
        eyebrow={siteName || undefined}
        title={t('pos.title')}
        description={t('pos.desc')}
        action={<ActionButton icon={BarChart3} label={t('pos.todaysSales')} onClick={() => navigate('/app/sales')} />}
      />
      <div className="-mt-1 lg:hidden">
        <ActionButton icon={BarChart3} label={t('pos.todaysSales')} onClick={() => navigate('/app/sales')} />
      </div>

      {lastSale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ops-teal/25 bg-teal-50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <CheckCircle2 size={18} className="shrink-0 text-ops-teal" />
            <div className="min-w-0">
              <p className="font-display text-[0.86rem] font-semibold text-ops-ink">
                {t('pos.saleDone', { number: lastSale.number })} · {formatEuro(lastSale.total)}
              </p>
              <p className="font-sans text-[0.76rem] text-slate-600">
                {t(`labels.paymentMethod.${lastSale.method}`)}
                {lastSale.change !== null && ` · ${t('pos.changeDue', { amount: formatEuro(lastSale.change) })}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/app/sales/${lastSale.id}`)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-display text-[0.76rem] font-medium text-ops-ink hover:border-ops-accent/30"
            >
              {t('pos.viewReceipt')}
            </button>
            <button type="button" onClick={() => setLastSale(null)} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white" aria-label={t('common.cancel')}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <GlassPanel
          padded={false}
          title={t('pos.findTitle')}
          action={
            cameraScanSupported() ? (
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-display text-[0.74rem] font-medium text-ops-ink hover:border-ops-accent/30 hover:text-ops-accent"
              >
                <ScanBarcode size={15} />
                {t('pos.scanWithCamera')}
              </button>
            ) : undefined
          }
        >
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                autoFocus={window.matchMedia('(pointer: fine)').matches}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  if (findByCode(allLevels, search)) handleCode(search);
                  else if (matches.length === 1) addProduct(matches[0]);
                  else if (search.trim() && matches.length === 0) toast.error(t('pos.unknownCode', { code: search.trim() }));
                }}
                placeholder={t('pos.searchPlaceholder')}
                disabled={!siteId}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-10 font-sans text-[0.95rem] text-ops-ink outline-none focus:border-ops-teal/50"
              />
            </label>
            <p className="mt-1.5 font-sans text-[0.72rem] text-slate-400">{t('pos.scannerHint')}</p>
          </div>

          {stockQuery.isLoading ? (
            <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('stock.loading')}</p>
          ) : levels.length === 0 ? (
            <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('pos.nothingInStock')}</p>
          ) : (
            <ul className="max-h-[32rem] overflow-y-auto">
              {(query ? matches : browse).map((level) => (
                <li key={level.productId} className="border-b border-slate-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => addProduct(level)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-indigo-50 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-display text-[0.86rem] text-ops-ink">{level.name}</span>
                      <span className="block truncate font-mono text-[0.66rem] text-slate-400">
                        {dishById.has(level.productId)
                          ? t('pos.portionsLeft', { count: level.onHand })
                          : `${level.code} · ${qtyFormat.format(level.onHand)} ${t(`labels.unit.${level.unit}`)}`}
                      </span>
                    </span>
                    <span className={cn('shrink-0 font-mono text-[0.84rem] tabular-nums', level.sellingPrice > 0 ? 'text-ops-ink' : 'text-slate-400')}>
                      {level.sellingPrice > 0 ? formatEuro(level.sellingPrice) : t('pos.noPriceShort')}
                    </span>
                  </button>
                </li>
              ))}
              {query && matches.length === 0 && (
                <li className="px-4 py-4 font-sans text-[0.8rem] text-slate-500 sm:px-5">{t('writeOff.noMatches')}</li>
              )}
              {!query && levels.length > BROWSE_LIMIT && (
                <li className="px-4 py-3 font-sans text-[0.74rem] text-slate-400 sm:px-5">
                  {t('pos.typeForMore', { count: levels.length - BROWSE_LIMIT })}
                </li>
              )}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel
          padded={false}
          title={t('pos.cartTitle', { count: itemCount })}
          action={
            cart.length > 0 ? (
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ title: t('pos.clearTitle'), confirmLabel: t('pos.clear'), danger: true })) setCart([]);
                }}
                className="font-display text-[0.74rem] font-medium text-slate-500 hover:text-ops-danger"
              >
                {t('pos.clear')}
              </button>
            ) : undefined
          }
        >
          {cart.length === 0 ? (
            <p className="px-4 py-8 text-center font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('pos.emptyCart')}</p>
          ) : (
            <ul>
              {plans.map((plan) => {
                const { line, level } = plan;
                const unit = level ? t(`labels.unit.${level.unit}`) : '';
                const problem = problemText(plan);
                return (
                  <li key={line.key} className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-display text-[0.86rem] font-medium text-ops-ink">{level?.name ?? '—'}</p>
                        {plan.dish && (
                          <p className="flex items-center gap-1 font-sans text-[0.7rem] text-slate-400">
                            <ChefHat size={12} />
                            {t('pos.fromRecipe')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="-mt-1 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-ops-danger"
                        aria-label={t('writeOff.removeItem')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {level?.batchTracking && level.batches.length > 0 && (
                      <Select
                        id={`${line.key}-batch`}
                        value={line.batchId}
                        onChange={(value) => updateLine(line.key, { batchId: value })}
                        options={[
                          {
                            value: '',
                            label: line.batchId || plan.takes.length === 0
                              ? t('pos.batchAuto')
                              : t('pos.batchAutoPicked', { batches: plan.takes.map((take) => take.batch?.batchNumber).join(' + ') }),
                          },
                          ...level.batches.map((batch) => ({ value: batch.batchId, label: batchLabel(batch) })),
                        ]}
                      />
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.round((parseAmount(line.qty) - 1) * 1000) / 1000;
                            if (next <= 0) removeLine(line.key);
                            else updateLine(line.key, { qty: String(next) });
                          }}
                          className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                          aria-label="−1"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                          aria-label={t('writeOff.qty')}
                          className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-1.5 text-center font-mono text-[0.88rem] text-ops-ink outline-none focus:border-ops-teal/50"
                        />
                        <button
                          type="button"
                          onClick={() => updateLine(line.key, { qty: String(Math.round((parseAmount(line.qty) + 1) * 1000) / 1000) })}
                          className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                          aria-label="+1"
                        >
                          <Plus size={14} />
                        </button>
                        <span className="ml-1 font-sans text-[0.72rem] text-slate-400">{unit}</span>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {editingPrice === line.key ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            defaultValue={String(plan.unitPrice)}
                            onBlur={(event) => {
                              const value = parseAmount(event.target.value);
                              if (value >= 0) {
                                updateLine(line.key, { price: level && value === level.sellingPrice ? null : String(value) });
                              }
                              setEditingPrice(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') setEditingPrice(null);
                            }}
                            aria-label={t('pos.unitPrice')}
                            className="h-9 w-20 rounded-lg border border-ops-accent/40 bg-white px-1.5 text-right font-mono text-[0.84rem] outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={!manager}
                            onClick={() => setEditingPrice(line.key)}
                            title={manager ? t('pos.changePrice') : undefined}
                            className={cn(
                              'rounded-md px-1 font-mono text-[0.74rem] text-slate-500',
                              manager && 'underline decoration-dotted underline-offset-2 hover:text-ops-accent',
                              line.price !== null && 'text-ops-accent',
                            )}
                          >
                            × {formatEuro(Number.isFinite(plan.unitPrice) ? plan.unitPrice : 0)}
                          </button>
                        )}
                        <span className="min-w-[4.5rem] font-mono text-[0.9rem] font-medium text-ops-ink tabular-nums">{formatEuro(plan.total)}</span>
                      </div>
                    </div>
                    {problem && <p className="font-display text-[0.72rem] font-medium text-ops-danger">{problem}</p>}
                    {!problem && plan.expired && (
                      <p className="font-display text-[0.72rem] font-medium text-amber-700">{t('pos.expiredLine')}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-ops-canvas/60 px-4 py-4 sm:px-5">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[0.8rem] font-medium tracking-wide text-slate-500 uppercase">{t('pos.total')}</span>
              <span className="font-display text-[1.6rem] font-semibold tracking-tight text-ops-ink tabular-nums">{formatEuro(total)}</span>
            </div>
            <p className="-mt-2 text-right font-sans text-[0.7rem] text-slate-400">{t('pos.vatIncluded')}</p>

            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('pos.paymentMethod')}>
              {(['CASH', 'CARD'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={method === option}
                  onClick={() => setMethod(option)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 font-display text-[0.84rem] font-medium transition-all',
                    method === option
                      ? 'border-ops-accent/30 bg-indigo-50 text-ops-accent'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-ops-accent/20',
                  )}
                >
                  {option === 'CASH' ? <Banknote size={16} /> : <CreditCard size={16} />}
                  {t(`labels.paymentMethod.${option}`)}
                </button>
              ))}
            </div>

            {method === 'CASH' && total > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="pos-received" className="shrink-0 font-sans text-[0.78rem] text-slate-500">
                    {t('pos.received')}
                  </label>
                  <input
                    id="pos-received"
                    type="text"
                    inputMode="decimal"
                    value={received}
                    onChange={(event) => setReceived(event.target.value)}
                    placeholder={formatEuro(total)}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-right font-mono text-[0.9rem] outline-none focus:border-ops-teal/50"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setReceived(String(total))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[0.74rem] text-ops-ink hover:border-ops-accent/30">
                    {t('pos.exact')}
                  </button>
                  {cashNotes(total).map((note) => (
                    <button key={note} type="button" onClick={() => setReceived(String(note))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[0.74rem] text-ops-ink hover:border-ops-accent/30">
                      {formatEuro(note)}
                    </button>
                  ))}
                </div>
                {received.trim() !== '' && (
                  <p className={cn('text-right font-display text-[0.9rem] font-semibold', change === null ? 'text-ops-danger' : 'text-ops-teal')}>
                    {change === null ? t('pos.notEnoughCash') : t('pos.changeDue', { amount: formatEuro(change) })}
                  </p>
                )}
              </div>
            )}

            {error && <FieldError>{error}</FieldError>}
            <div className="hidden lg:flex lg:flex-col">{payButton}</div>
          </div>
        </GlassPanel>
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-3 bottom-24 z-30 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)] backdrop-blur sm:inset-x-6 lg:hidden">
          <div className="min-w-0">
            <p className="font-display text-[0.8rem] font-medium text-ops-ink">{t('pos.cartTitle', { count: itemCount })}</p>
            <p className="truncate font-sans text-[0.72rem] text-slate-500">
              {t(`labels.paymentMethod.${method}`)}
              {change !== null && ` · ${t('pos.changeDue', { amount: formatEuro(change) })}`}
            </p>
          </div>
          {payButton}
        </div>
      )}

      {scanning && <BarcodeScanner onDetected={handleCode} onClose={() => setScanning(false)} />}
    </div>
  );
};
