import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import type { DocumentLineRecord, DocumentLineWriteInput, ProductRecord } from '../../lib/workspace-api';
import { useProductsQuery } from '../../lib/workspace-session';
import { toast } from '../ui/Toaster';

export type LineIssue = 'product' | 'archived' | 'qty' | 'batch' | 'expiry';

/** Mirrors the API's postingErrors() so problems show on the line before the user tries to post. */
export function lineIssues(line: DocumentLineRecord): LineIssue[] {
  if (!line.product) return ['product'];
  const issues: LineIssue[] = [];
  if (line.product.status === 'ARCHIVED') issues.push('archived');
  if (line.quantity <= 0) issues.push('qty');
  if (line.product.batchTracking) {
    if (!line.batchNumber?.trim()) issues.push('batch');
    if (!line.expiryDate) issues.push('expiry');
  }
  return issues;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-sans text-[0.84rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

const labelClass = 'mb-1 block font-display text-[0.68rem] font-medium tracking-wide text-slate-500 uppercase';

type PickedProduct = Pick<ProductRecord, 'id' | 'name' | 'code' | 'batchTracking' | 'vatRate'> & {
  purchasePrice?: number;
};

export function DocumentLines({
  lines,
  editable,
  selectedLineId,
  onSelect,
  onUpdate,
  onDelete,
  saving,
}: {
  lines: DocumentLineRecord[];
  editable: boolean;
  selectedLineId: string | null;
  onSelect: (lineId: string | null) => void;
  onUpdate: (lineId: string, input: Partial<DocumentLineWriteInput>) => Promise<void>;
  onDelete: (lineId: string) => Promise<void>;
  saving: boolean;
}) {
  const { t } = useTranslation();

  return (
    <ul>
      {lines.map((line, index) => {
        const issues = lineIssues(line);
        const selected = line.id === selectedLineId;
        const printedDiffers =
          line.printed.description && line.product && line.printed.description.trim() !== line.product.name.trim();
        return (
          <li key={line.id} className={cn('border-b border-slate-100 last:border-0', selected && 'bg-indigo-50/40')}>
            <button
              type="button"
              onClick={() => onSelect(selected ? null : line.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ops-canvas/70 sm:px-5"
            >
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[0.68rem]',
                  issues.length > 0
                    ? 'border-ops-warn/30 bg-orange-50 text-ops-warn'
                    : selected
                      ? 'border-ops-accent/30 bg-white text-ops-accent'
                      : 'border-slate-200 bg-white text-slate-500',
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-display text-[0.86rem] font-medium text-ops-ink">
                  {line.product?.name ?? t('doc.unmatched')}
                </span>
                {printedDiffers && (
                  <span className="line-clamp-2 font-sans text-[0.72rem] text-slate-500">
                    {t('doc.printed')}: {line.printed.description}
                  </span>
                )}
                <span className="mt-0.5 block font-mono text-[0.7rem] text-slate-500">
                  {line.quantity} {line.unit ? t(`labels.unit.${line.unit}`) : ''} × {formatEuro(line.finalUnitPrice ?? line.unitPrice)}
                  {line.discountPercent > 0 ? ` (−${line.discountPercent}%)` : ''}
                  {line.product?.batchTracking && line.batchNumber ? ` · ${line.batchNumber}` : ''}
                  {line.product?.batchTracking && line.expiryDate ? ` · ${line.expiryDate}` : ''}
                </span>
                {issues.length > 0 && (
                  <span className="mt-1 flex items-center gap-1 font-display text-[0.7rem] font-medium text-ops-warn">
                    <TriangleAlert size={11} />
                    {issues.map((issue) => t(`doc.issue.${issue}`)).join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[0.8rem] text-ops-ink">
                {line.lineTotal === null ? '—' : formatEuro(line.lineTotal)}
              </span>
            </button>

            {selected && editable && (
              <div className="px-4 pb-4 sm:px-5">
                <LineForm
                  key={line.id}
                  line={line}
                  saving={saving}
                  hasNext={index < lines.length - 1}
                  onCancel={() => onSelect(null)}
                  onDelete={() => onDelete(line.id)}
                  onSubmit={async (input, next) => {
                    await onUpdate(line.id, input);
                    onSelect(next && index < lines.length - 1 ? lines[index + 1].id : null);
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function LineForm({
  line,
  saving,
  hasNext = false,
  onSubmit,
  onCancel,
  onDelete,
}: {
  line?: DocumentLineRecord;
  saving: boolean;
  hasNext?: boolean;
  onSubmit: (input: DocumentLineWriteInput, next: boolean) => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [product, setProduct] = useState<PickedProduct | null>(line?.product ?? null);
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(line ? String(line.unitPrice) : '');
  const [discountPercent, setDiscountPercent] = useState(String(line?.discountPercent ?? 0));
  const [batchNumber, setBatchNumber] = useState(line?.batchNumber ?? '');
  const [expiryDate, setExpiryDate] = useState(line?.expiryDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitNext, setSubmitNext] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = (event.nativeEvent as SubmitEvent).submitter?.dataset.next === '1';
    setSubmitNext(next);
    if (!product) {
      toast.error(t('doc.pickProduct'));
      return;
    }
    setError(null);
    try {
      await onSubmit(
        {
          productId: product.id,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          discountPercent: Number(discountPercent) || 0,
          ...(!line || product.id !== line.productId ? { vatRate: product.vatRate } : {}),
          batchNumber: product.batchTracking ? batchNumber.trim() : undefined,
          expiryDate: product.batchTracking ? (line ? expiryDate : expiryDate || undefined) : undefined,
        },
        next,
      );
      if (!line) {
        setProduct(null);
        setQuantity('1');
        setUnitPrice('');
        setDiscountPercent('0');
        setBatchNumber('');
        setExpiryDate('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('doc.saveLineFailed'));
    }
  };

  const printed = line?.printed;
  const hasPrinted = Boolean(printed && (printed.description || printed.supplierCode || printed.unit) && line?.sourceCaptureId);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      {hasPrinted && printed && (
        <p className="rounded-lg bg-ops-canvas px-3 py-2 font-sans text-[0.76rem] text-slate-600">
          <span className="font-display font-medium text-slate-500">{t('doc.printed')}: </span>
          {[printed.description, printed.supplierCode && t('doc.printedCode', { code: printed.supplierCode }), printed.unit]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <div>
        <span className={labelClass}>{t('doc.product')}</span>
        <ProductPicker
          value={product}
          onChange={(next) => {
            setProduct(next);
            if (next && !line) setUnitPrice(String(next.purchasePrice));
          }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={labelClass}>{t('doc.qty')}</span>
          <input type="number" inputMode="decimal" min="0.001" step="0.001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>{t('doc.price')}</span>
          <input type="number" inputMode="decimal" min="0" step="0.0001" required value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>{t('doc.discount')}</span>
          <input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} className={inputClass} />
        </label>
      </div>
      {product?.batchTracking && (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={labelClass}>{t('doc.batch')}</span>
            <input value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>{t('doc.expiry')}</span>
            <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className={inputClass} />
          </label>
        </div>
      )}
      {error && <p className="font-sans text-[0.76rem] text-ops-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {line && hasNext && (
          <button
            type="submit"
            data-next="1"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ops-teal px-3 py-2 font-display text-[0.78rem] font-medium text-white disabled:opacity-50"
          >
            {saving && submitNext && <Loader2 size={12} className="animate-spin" />}
            {t('doc.saveNext')}
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-display text-[0.78rem] font-medium disabled:opacity-50',
            line && hasNext ? 'border border-slate-200 bg-white text-ops-ink' : 'bg-ops-teal text-white',
          )}
        >
          {line ? null : <Plus size={12} />}
          {line ? t('common.save') : t('doc.addLine')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-2 py-2 font-display text-[0.76rem] text-slate-500 hover:text-ops-ink">
            {t('common.cancel')}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex items-center gap-1 rounded-lg p-2 font-display text-[0.74rem] text-slate-400 hover:bg-rose-50 hover:text-ops-danger"
          >
            <Trash2 size={13} />
            {t('doc.removeLine')}
          </button>
        )}
      </div>
    </form>
  );
}

function ProductPicker({
  value,
  onChange,
}: {
  value: PickedProduct | null;
  onChange: (product: ProductRecord | null) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const productsQuery = useProductsQuery({ q: debounced || undefined, status: 'ACTIVE' });
  const products = productsQuery.data?.products ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="relative">
      <input
        value={value ? `${value.name} (${value.code})` : search}
        onChange={(event) => {
          onChange(null);
          setSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('doc.searchProducts')}
        className={inputClass}
      />
      {open && !value && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-20 max-h-52 w-[min(22rem,80vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {products.length === 0 ? (
            <p className="px-3 py-2 font-sans text-[0.74rem] text-slate-400">{t('doc.noMatchingProducts')}</p>
          ) : (
            products.slice(0, 12).map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onChange(product);
                  setSearch('');
                  setOpen(false);
                }}
                className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-ops-canvas"
              >
                <span className="font-display text-[0.78rem] font-medium text-ops-ink">{product.name}</span>
                <span className="font-mono text-[0.64rem] text-slate-400">
                  {product.code}
                  {product.batchTracking ? ` · ${t('doc.batchShort')}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
