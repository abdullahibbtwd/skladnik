import React, { useState } from 'react';
import { CheckCircle2, Loader2, PackagePlus, Search, Sparkles } from 'lucide-react';
import { UNITS_OF_MEASURE, type UnitOfMeasure } from '@skladnik/shared';
import { useTranslation } from 'react-i18next';
import type { CreateProductFromLineInput, DocumentLineRecord, ProductSuggestion } from '../../lib/workspace-api';
import { Select } from '../ui/Select';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-sans text-[0.84rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

const labelClass = 'mb-1 block font-display text-[0.68rem] font-medium tracking-wide text-slate-500 uppercase';

const chipClass =
  'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-display text-[0.76rem] font-medium disabled:opacity-50';

/** A scanned line needs a person here: nothing in the catalog matched, or a scan made the product up. */
export function needsProductMatch(line: DocumentLineRecord) {
  return Boolean(line.sourceCaptureId) && (!line.product || line.product.status === 'PENDING_REVIEW');
}

/**
 * Under an unmatched scanned line: one-click "did you mean", choose another product, or create one
 * from the printed name. Scans never create products themselves.
 */
export function ScannedLineMatch({
  line,
  busy,
  onLink,
  onChoose,
  onCreate,
  onConfirmPending,
}: {
  line: DocumentLineRecord;
  busy: boolean;
  onLink: (suggestion: ProductSuggestion) => Promise<void>;
  onChoose: () => void;
  onCreate: (input: CreateProductFromLineInput) => Promise<void>;
  onConfirmPending: (productId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const pending = line.product?.status === 'PENDING_REVIEW' ? line.product : null;
  const printedName = line.printed.name ?? line.printed.description ?? '';

  if (creating) {
    return <CreateProductForm line={line} busy={busy} onCancel={() => setCreating(false)} onCreate={onCreate} />;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ops-warn/25 bg-orange-50/70 px-3 py-2.5">
      <p className="font-sans text-[0.76rem] text-ops-warn">
        {pending ? t('scanMatch.pendingHint', { name: pending.name }) : t('scanMatch.noMatchHint', { name: printedName })}
      </p>
      {line.suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 font-display text-[0.72rem] font-medium text-slate-500">
            <Sparkles size={12} />
            {t('scanMatch.didYouMean')}
          </span>
          {line.suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              disabled={busy}
              onClick={() => void onLink(suggestion)}
              className={`${chipClass} border-ops-teal/30 bg-white text-ops-ink hover:border-ops-teal hover:bg-teal-50`}
              title={t('scanMatch.linkTitle', { name: suggestion.name })}
            >
              <span className="truncate">{suggestion.name}</span>
              <span className="shrink-0 font-mono text-[0.64rem] text-slate-400">{suggestion.code}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={onChoose} className={`${chipClass} border-slate-200 bg-white text-ops-ink hover:border-ops-accent/40`}>
          <Search size={12} />
          {t('scanMatch.choose')}
        </button>
        {pending ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirmPending(pending.id)}
            className={`${chipClass} border-transparent bg-ops-teal text-white`}
          >
            <CheckCircle2 size={12} />
            {t('scanMatch.confirmNew')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCreating(true)}
            className={`${chipClass} border-transparent bg-ops-teal text-white`}
          >
            <PackagePlus size={12} />
            <span className="truncate">{printedName ? t('scanMatch.createNamed', { name: printedName }) : t('scanMatch.create')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CreateProductForm({
  line,
  busy,
  onCancel,
  onCreate,
}: {
  line: DocumentLineRecord;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: CreateProductFromLineInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(line.printed.name ?? line.printed.description ?? '');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState<UnitOfMeasure>(line.unit ?? 'PCS');
  const [vatRate, setVatRate] = useState(String(line.vatRate));
  const [batchTracking, setBatchTracking] = useState(Boolean(line.batchNumber || line.expiryDate));
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onCreate({ name: name.trim(), code: code.trim() || undefined, unit, vatRate: Number(vatRate), batchTracking });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('scanMatch.createFailed'));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="font-display text-[0.8rem] font-semibold text-ops-ink">{t('scanMatch.createTitle')}</p>
      <label>
        <span className={labelClass}>{t('scanMatch.name')}</span>
        <input required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label>
          <span className={labelClass}>{t('scanMatch.code')}</span>
          <input maxLength={64} value={code} placeholder={t('scanMatch.codeAuto')} onChange={(event) => setCode(event.target.value)} className={inputClass} />
        </label>
        <div>
          <span className={labelClass}>{t('scanMatch.unit')}</span>
          <Select<UnitOfMeasure>
            value={unit}
            onChange={setUnit}
            options={UNITS_OF_MEASURE.map((item) => ({ value: item, label: t(`labels.unit.${item}`) }))}
          />
        </div>
        <label>
          <span className={labelClass}>{t('scanMatch.vat')}</span>
          <input type="number" inputMode="decimal" min="0" max="100" step="0.01" required value={vatRate} onChange={(event) => setVatRate(event.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="flex items-center gap-2 font-sans text-[0.8rem] text-ops-ink">
        <input type="checkbox" checked={batchTracking} onChange={(event) => setBatchTracking(event.target.checked)} className="size-4 accent-ops-teal" />
        {t('scanMatch.batchTracking')}
      </label>
      {(line.printed.supplierCode || line.printed.barcode) && (
        <p className="font-sans text-[0.72rem] text-slate-500">
          {t('scanMatch.remembers', { codes: [line.printed.supplierCode, line.printed.barcode].filter(Boolean).join(' · ') })}
        </p>
      )}
      {error && <p className="font-sans text-[0.76rem] text-ops-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ops-teal px-3 py-2 font-display text-[0.78rem] font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />}
          {t('scanMatch.createSubmit')}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-2 font-display text-[0.76rem] text-slate-500 hover:text-ops-ink">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
