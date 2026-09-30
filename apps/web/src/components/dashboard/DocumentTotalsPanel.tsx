import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DOCUMENT_PAYMENT_METHODS,
  TOTALS_FIELDS,
  reconcileTotals,
  type DocumentPaymentMethod,
  type TotalsCheck,
  type TotalsField,
} from '@skladnik/shared';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import type { PrintedTotalsInput } from '../../lib/workspace-api';
import { Select } from '../ui/Select';
import { GlassPanel } from './dashboard-ui';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-right font-mono text-[0.84rem] text-ops-ink outline-none placeholder:text-slate-300 focus:border-ops-teal/50 focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

/** Accepts "90,24" as typed on a Bulgarian keyboard. Empty means not printed. */
function parseAmount(value: string): number | null | undefined {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : undefined;
}

const asText = (value: number | null) => (value === null ? '' : String(value));

export function TotalsBadge({ check }: { check: Pick<TotalsCheck, 'status' | 'required'> }) {
  const { t } = useTranslation();
  const tone =
    check.status === 'MATCH' ? 'match' : check.status === 'MISMATCH' ? 'mismatch' : check.required ? 'required' : 'missing';
  const Icon = tone === 'match' ? CheckCircle2 : tone === 'missing' ? CircleDashed : XCircle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-[0.7rem] font-semibold',
        tone === 'match' && 'border-ops-teal/25 bg-teal-50 text-ops-teal',
        tone === 'mismatch' && 'border-ops-danger/25 bg-rose-50 text-ops-danger',
        tone === 'required' && 'border-ops-danger/25 bg-rose-50 text-ops-danger',
        tone === 'missing' && 'border-slate-200 bg-slate-50 text-slate-500',
      )}
    >
      <Icon size={12} />
      {t(`doc.totals.badge.${tone}`)}
    </span>
  );
}

export function DocumentTotalsPanel({
  totals,
  paymentMethod,
  lineCount,
  type,
  editable,
  saving,
  onSave,
}: {
  totals: TotalsCheck;
  paymentMethod: DocumentPaymentMethod | null;
  lineCount: number;
  type: string;
  editable: boolean;
  saving: boolean;
  onSave: (input: PrintedTotalsInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Record<TotalsField, string>>({ taxableBase: '', vat: '', total: '' });
  const [method, setMethod] = useState<DocumentPaymentMethod | ''>('');

  useEffect(() => {
    setDraft({ taxableBase: asText(totals.printed.taxableBase), vat: asText(totals.printed.vat), total: asText(totals.printed.total) });
    setMethod(paymentMethod ?? '');
  }, [totals.printed.taxableBase, totals.printed.vat, totals.printed.total, paymentMethod]);

  const parsed = useMemo(
    () => Object.fromEntries(TOTALS_FIELDS.map((field) => [field, parseAmount(draft[field])])) as Record<TotalsField, number | null | undefined>,
    [draft],
  );
  const invalid = TOTALS_FIELDS.some((field) => parsed[field] === undefined);
  // Live preview while typing; the server repeats the same check before posting.
  const live = invalid
    ? totals
    : reconcileTotals({
        type,
        calculated: totals.calculated,
        printed: { taxableBase: parsed.taxableBase ?? null, vat: parsed.vat ?? null, total: parsed.total ?? null },
        lineCount,
      });
  const dirty =
    TOTALS_FIELDS.some((field) => parsed[field] !== totals.printed[field]) || (method || null) !== paymentMethod;
  const byRate = totals.calculated.byRate ?? [];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalid) return;
    await onSave({
      printedTaxableBase: parsed.taxableBase ?? null,
      printedVatAmount: parsed.vat ?? null,
      printedTotal: parsed.total ?? null,
      paymentMethod: method || null,
    });
  };

  return (
    <GlassPanel title={t('doc.totals.title')} action={<TotalsBadge check={live} />}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          <span />
          <span className="text-right font-display text-[0.66rem] font-medium tracking-wide text-slate-500 uppercase">{t('doc.totals.printed')}</span>
          <span className="text-right font-display text-[0.66rem] font-medium tracking-wide text-slate-500 uppercase">{t('doc.totals.calculated')}</span>
          <span className="hidden text-right font-display text-[0.66rem] font-medium tracking-wide text-slate-500 uppercase sm:block">
            {t('doc.totals.difference')}
          </span>
          {TOTALS_FIELDS.map((field) => {
            const off = live.mismatched.includes(field);
            const difference = live.difference[field];
            return (
              <React.Fragment key={field}>
                <label htmlFor={`totals-${field}`} className={cn('self-center font-display text-[0.8rem] text-ops-ink', field === 'total' && 'font-semibold')}>
                  {t(`doc.totals.field.${field}`)}
                </label>
                {editable ? (
                  <input
                    id={`totals-${field}`}
                    inputMode="decimal"
                    value={draft[field]}
                    placeholder="—"
                    onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
                    aria-invalid={off || parsed[field] === undefined}
                    className={cn(inputClass, (off || parsed[field] === undefined) && 'border-ops-danger/50 bg-rose-50/60')}
                  />
                ) : (
                  <span className="self-center text-right font-mono text-[0.84rem] text-ops-ink">
                    {totals.printed[field] === null ? '—' : formatEuro(totals.printed[field]!)}
                  </span>
                )}
                <span className={cn('self-center text-right font-mono text-[0.84rem]', field === 'total' ? 'font-semibold text-ops-ink' : 'text-slate-600')}>
                  {formatEuro(live.calculated[field])}
                </span>
                <span
                  className={cn(
                    'col-span-3 -mt-1 text-right font-mono text-[0.72rem] sm:col-span-1 sm:mt-0 sm:self-center sm:text-[0.8rem]',
                    difference === null ? 'text-slate-300' : off ? 'font-semibold text-ops-danger' : 'text-ops-teal',
                    difference === null && 'max-sm:hidden',
                  )}
                >
                  {difference === null ? '—' : `${difference > 0 ? '+' : ''}${formatEuro(difference)}`}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {byRate.length > 1 && (
          <div className="rounded-lg border border-slate-100 bg-ops-canvas/60 px-3 py-2">
            <p className="mb-1.5 font-display text-[0.66rem] font-medium tracking-wide text-slate-500 uppercase">{t('doc.totals.byRate')}</p>
            <ul className="flex flex-col gap-1">
              {byRate.map((row) => (
                <li key={row.rate} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-[0.74rem] text-slate-600">
                  <span className="font-display text-[0.74rem] text-ops-ink">{t('doc.totals.rateLabel', { rate: row.rate })}</span>
                  <span>
                    {formatEuro(row.taxableBase)} + {formatEuro(row.vat)} = {formatEuro(row.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="font-sans text-[0.72rem] text-slate-500">
          {live.status === 'MISMATCH'
            ? t('doc.totals.mismatchHint')
            : live.status === 'MISSING' && live.required
              ? t('doc.totals.requiredHint')
              : t('doc.totals.toleranceHint', { tolerance: formatEuro(live.tolerance) })}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <span className="mb-1 block font-display text-[0.68rem] font-medium tracking-wide text-slate-500 uppercase">{t('doc.totals.paymentMethod')}</span>
            <Select<DocumentPaymentMethod | ''>
              id="totals-payment"
              value={method}
              onChange={setMethod}
              options={[
                { value: '' as const, label: t('doc.totals.paymentNotPrinted') },
                ...DOCUMENT_PAYMENT_METHODS.map((value) => ({ value, label: t(`labels.paymentMethod.${value}`) })),
              ]}
              disabled={!editable}
            />
          </div>
          {editable && (
            <button
              type="submit"
              disabled={saving || invalid || !dirty}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-display text-[0.82rem] font-medium text-ops-ink shadow-sm hover:border-ops-accent/30 disabled:opacity-50"
            >
              {t('doc.totals.save')}
            </button>
          )}
        </div>
      </form>
    </GlassPanel>
  );
}
