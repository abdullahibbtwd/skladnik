import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { formatDate, formatQty } from '../../lib/format';
import { usePermissions } from '../../lib/permissions';
import type {
  CreateProductFromLineInput,
  DocumentLineRecord,
  DocumentLineWriteInput,
  ProductRecord,
  ProductSuggestion,
} from '../../lib/workspace-api';
import { suggestDocumentAutoBatch } from '../../lib/workspace-api';
import { useProductsQuery } from '../../lib/workspace-session';
import { DateField } from '../ui/DateField';
import { toast } from '../ui/Toaster';
import { ScannedLineMatch, needsProductMatch } from './ScannedLineMatch';

export type LineIssue = 'product' | 'archived' | 'pending' | 'qty' | 'batch' | 'expiry';

/** Mirrors the API's postingErrors() so problems show on the line before the user tries to post. */
export function lineIssues(line: DocumentLineRecord): LineIssue[] {
  if (!line.product) return ['product'];
  const issues: LineIssue[] = [];
  if (line.product.status === 'ARCHIVED') issues.push('archived');
  if (line.product.status === 'PENDING_REVIEW') issues.push('pending');
  if (line.quantity <= 0) issues.push('qty');
  if (line.product.batchTracking) {
    // SKL-15: expiry alone is enough — server generates A-YYYYMMDD-NN when batch is empty.
    if (!line.expiryDate) {
      if (!line.batchNumber?.trim()) issues.push('batch');
      issues.push('expiry');
    }
  }
  return issues;
}

/** OCR's printed line total disagrees with qty × price by more than a cent: this is the line to check. */
function printedTotalDiffers(line: DocumentLineRecord) {
  return line.printedLineTotal != null && line.lineTotal != null && Math.abs(line.printedLineTotal - line.lineTotal) > 0.01;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-sans text-[0.84rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

const labelClass = 'mb-1 block font-display text-[0.68rem] font-medium tracking-wide text-slate-500 uppercase';

type PickedProduct = Pick<ProductRecord, 'id' | 'name' | 'code' | 'batchTracking' | 'vatRate'> & {
  purchasePrice?: number;
};

export function DocumentLines({
  documentId,
  lines,
  editable,
  selectedLineId,
  onSelect,
  onUpdate,
  onDelete,
  onCreateProduct,
  onConfirmProduct,
  saving,
  expiryGuardDate,
  onEnableBatch,
}: {
  documentId: string;
  lines: DocumentLineRecord[];
  editable: boolean;
  /** Document date when an expired batch on this document needs confirmation. */
  expiryGuardDate?: string;
  selectedLineId: string | null;
  onSelect: (lineId: string | null) => void;
  onUpdate: (lineId: string, input: Partial<DocumentLineWriteInput>) => Promise<void>;
  onDelete: (lineId: string) => Promise<void>;
  onCreateProduct: (lineId: string, input: CreateProductFromLineInput) => Promise<void>;
  onConfirmProduct: (productId: string) => Promise<void>;
  saving: boolean;
  onEnableBatch?: (productId: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { seeFinancials, manage } = usePermissions();
  /** A suggestion that still needs batch details opens the line form with it already picked. */
  const [preset, setPreset] = useState<{ lineId: string; product: PickedProduct } | null>(null);

  const link = async (line: DocumentLineRecord, suggestion: ProductSuggestion) => {
    if (suggestion.batchTracking && (!line.batchNumber?.trim() || !line.expiryDate)) {
      setPreset({ lineId: line.id, product: suggestion });
      onSelect(line.id);
      return;
    }
    try {
      await onUpdate(line.id, { productId: suggestion.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.saveLineFailed'));
    }
  };

  return (
    <ul>
      {lines.map((line, index) => {
        const issues = lineIssues(line);
        const selected = line.id === selectedLineId;
        const printedDiffers =
          line.printed.description && (!line.product || line.printed.description.trim() !== line.product.name.trim());
        const matching = editable && !selected && needsProductMatch(line);
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
                  {line.product?.status === 'PENDING_REVIEW' && (
                    <span className="ml-1.5 rounded bg-orange-100 px-1 py-px align-middle font-sans text-[0.64rem] font-medium text-ops-warn">
                      {t('doc.pendingReview')}
                    </span>
                  )}
                  {seeFinancials && line.missingPrice && (
                    <span className="ml-1.5 rounded bg-rose-100 px-1 py-px align-middle font-sans text-[0.64rem] font-medium text-ops-danger">
                      {t('doc.missingPrice')}
                    </span>
                  )}
                  {seeFinancials && line.freeOfCharge && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1 py-px align-middle font-sans text-[0.64rem] font-medium text-slate-600">
                      {t('doc.freeOfCharge')}
                    </span>
                  )}
                </span>
                {printedDiffers && (
                  <span className="line-clamp-2 font-sans text-[0.72rem] text-slate-500">
                    {t('doc.printed')}: {line.printed.description}
                  </span>
                )}
                <span className="mt-0.5 block font-mono text-[0.7rem] text-slate-500">
                  {formatQty(line.quantity, i18n.language)} {line.unit ? t(`labels.unit.${line.unit}`) : ''}
                  {seeFinancials
                    ? ` × ${formatEuro(line.finalUnitPrice ?? line.unitPrice ?? 0)}${line.discountPercent > 0 ? ` (−${line.discountPercent}%)` : ''}`
                    : ''}
                  {line.batchNumber ? ` · ${line.batchNumber}` : ''}
                  {line.expiryDate ? ` · ${formatDate(line.expiryDate, i18n.language)}` : ''}
                </span>
                {(line.quantityCheck || line.unitCheck || line.batchNotTracked) && (
                  <span className="mt-1 block font-sans text-[0.72rem] text-ops-warn">
                    {line.quantityCheck && (
                      <span className="mr-2 inline-flex items-center gap-1">
                        <TriangleAlert size={11} />
                        {t('doc.checkQuantity')}
                        {editable && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-1 font-display font-medium text-ops-accent hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onUpdate(line.id, { confirmQuantity: true });
                            }}
                          >
                            {t('doc.confirmQuantity')}
                          </span>
                        )}
                      </span>
                    )}
                    {line.unitCheck && (
                      <span className="mr-2 inline-flex items-center gap-1">
                        <TriangleAlert size={11} />
                        {t('doc.checkUnit')}
                        {editable && manage && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-1 font-display font-medium text-ops-accent hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onUpdate(line.id, { confirmUnit: true });
                            }}
                          >
                            {t('doc.confirmUnit')}
                          </span>
                        )}
                      </span>
                    )}
                    {line.batchNotTracked && (
                      <span className="mt-1 block">
                        {t('doc.batchNotTracked')}
                        {editable && manage && line.product && onEnableBatch && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-1 font-display font-medium text-ops-accent hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onEnableBatch(line.product!.id);
                            }}
                          >
                            {t('doc.enableBatchTracking')}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                )}
                {issues.length > 0 && (
                  <span className="mt-1 flex items-center gap-1 font-display text-[0.7rem] font-medium text-ops-warn">
                    <TriangleAlert size={11} />
                    {issues.map((issue) => t(`doc.issue.${issue}`)).join(' · ')}
                  </span>
                )}
                {line.expired && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-ops-danger/25 bg-rose-50 px-1.5 py-0.5 font-display text-[0.7rem] font-medium text-ops-danger">
                    <TriangleAlert size={11} />
                    {t('doc.lineExpired', { date: line.expiryDate ? formatDate(line.expiryDate, i18n.language) : '—' })}
                  </span>
                )}
              </span>
              {seeFinancials && (
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-[0.8rem] text-ops-ink">{line.lineTotal == null ? '—' : formatEuro(line.lineTotal)}</span>
                  {printedTotalDiffers(line) && (
                    <span className="font-mono text-[0.68rem] text-ops-danger" title={t('doc.printedLineTotalHint')}>
                      {t('doc.printedLineTotal', { total: formatEuro(line.printedLineTotal!) })}
                    </span>
                  )}
                </span>
              )}
            </button>

            {matching && (
              <div className="px-4 pb-3 sm:px-5">
                <ScannedLineMatch
                  line={line}
                  busy={saving}
                  onLink={(suggestion) => link(line, suggestion)}
                  onChoose={() => onSelect(line.id)}
                  onCreate={(input) => onCreateProduct(line.id, input)}
                  onConfirmPending={onConfirmProduct}
                  canApprovePending={manage}
                />
              </div>
            )}

            {selected && editable && (
              <div className="px-4 pb-4 sm:px-5">
                <LineForm
                  key={line.id}
                  documentId={documentId}
                  line={line}
                  initialProduct={preset?.lineId === line.id ? preset.product : undefined}
                  saving={saving}
                  expiryGuardDate={expiryGuardDate}
                  hasNext={index < lines.length - 1}
                  onCancel={() => {
                    setPreset(null);
                    onSelect(null);
                  }}
                  onDelete={() => onDelete(line.id)}
                  onSubmit={async (input, next) => {
                    await onUpdate(line.id, input);
                    setPreset(null);
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
  documentId,
  line,
  initialProduct,
  saving,
  hasNext = false,
  expiryGuardDate,
  onSubmit,
  onCancel,
  onDelete,
}: {
  documentId: string;
  line?: DocumentLineRecord;
  /** Picked in place of the line's product, e.g. a "did you mean" that needs batch details. */
  initialProduct?: PickedProduct;
  saving: boolean;
  hasNext?: boolean;
  expiryGuardDate?: string;
  onSubmit: (input: DocumentLineWriteInput, next: boolean) => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { seeFinancials } = usePermissions();
  const [product, setProduct] = useState<PickedProduct | null>(
    initialProduct ?? (line?.product && line.product.status === 'ACTIVE' ? line.product : null),
  );
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(line ? String(line.unitPrice ?? 0) : '');
  const [discountPercent, setDiscountPercent] = useState(String(line?.discountPercent ?? 0));
  const [batchNumber, setBatchNumber] = useState(line?.batchNumber ?? '');
  const [expiryDate, setExpiryDate] = useState(line?.expiryDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitNext, setSubmitNext] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

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
          unitPrice: seeFinancials ? Number(unitPrice) : 0,
          discountPercent: seeFinancials ? Number(discountPercent) || 0 : 0,
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
            if (next && !line && seeFinancials) setUnitPrice(String(next.purchasePrice ?? 0));
          }}
        />
      </div>
      <div className={cn('grid gap-2', seeFinancials ? 'grid-cols-3' : 'grid-cols-1')}>
        <label>
          <span className={labelClass}>{t('doc.qty')}</span>
          <input type="number" inputMode="decimal" min="0.001" step="0.001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
        </label>
        {seeFinancials && (
          <>
            <label>
              <span className={labelClass}>{t('doc.price')}</span>
              <input type="number" inputMode="decimal" min="0" step="0.0001" required value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className={labelClass}>{t('doc.discount')}</span>
              <input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} className={inputClass} />
            </label>
          </>
        )}
      </div>
      {product?.batchTracking && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelClass}>{t('doc.batch')}</span>
            <div className="flex gap-1.5">
              <input
                value={batchNumber}
                onChange={(event) => setBatchNumber(event.target.value)}
                className={cn(inputClass, 'min-w-0 flex-1')}
              />
              <button
                type="button"
                disabled={!product || !expiryDate || autoBusy || saving}
                onClick={async () => {
                  if (!product || !expiryDate) return;
                  setAutoBusy(true);
                  try {
                    const result = await suggestDocumentAutoBatch(documentId, {
                      productId: product.id,
                      expiryDate,
                    });
                    setBatchNumber(result.batchNumber);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('doc.saveLineFailed'));
                  } finally {
                    setAutoBusy(false);
                  }
                }}
                className="shrink-0 rounded-lg border border-slate-200 bg-ops-canvas px-2.5 py-2 font-display text-[0.72rem] font-medium text-ops-ink disabled:opacity-50"
              >
                {autoBusy ? <Loader2 size={12} className="animate-spin" /> : t('doc.autoBatch')}
              </button>
            </div>
          </div>
          <label>
            <span className={labelClass}>{t('doc.expiry')}</span>
            <DateField value={expiryDate} onChange={setExpiryDate} className="w-full" />
          </label>
          {expiryGuardDate && expiryDate && expiryDate < expiryGuardDate && (
            <p className="col-span-2 flex items-start gap-1.5 font-sans text-[0.74rem] font-medium text-ops-danger">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              {t('doc.expiryBeforeDocument', { date: formatDate(expiryGuardDate, i18n.language) })}
            </p>
          )}
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
