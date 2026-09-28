import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  VAT_CREDITS,
  VAT_CREDIT_LABELS,
  VAT_DOCUMENT_TYPES,
  VAT_PURCHASE_DOCUMENT_TYPES,
  VAT_PURCHASE_FIELD_LABELS,
  VAT_PURCHASE_FIELDS,
  VAT_SALES_DOCUMENT_TYPES,
  VAT_SALES_FIELD_LABELS,
  VAT_SALES_FIELDS,
  VAT_SALES_GROUPINGS,
  shiftVatPeriod,
  vatPeriodOf,
  type ReportLang,
  type VatCredit,
  type VatEntryRecord,
  type VatLedger,
  type VatLedgerRow,
  type VatSalesGrouping,
  type VatSettingsRecord,
} from '@skladnik/shared';
import { cn } from '../../lib/cn';
import { useSaveVatEntry, useSaveVatSettings, useSetVatDocumentTreatment } from '../../lib/workspace-session';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { FilterField } from './report-ui';
import { WorkspaceModal } from './WorkspaceModal';

export const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-sans text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50 disabled:bg-slate-50';

export function monthLabel(period: string, lang: ReportLang) {
  return new Intl.DateTimeFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`));
}

function FormActions({ onCancel, busy, disabled }: { onCancel: () => void; busy: boolean; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-display text-[0.82rem] font-medium text-ops-ink hover:text-ops-accent"
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        disabled={busy || disabled}
        className="rounded-xl bg-ops-teal px-3.5 py-2 font-display text-[0.82rem] font-medium text-white shadow-[0_8px_18px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover disabled:opacity-50"
      >
        {busy ? t('vat.saving') : t('common.save')}
      </button>
    </div>
  );
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

// ─── Company VAT details ─────────────────────────────────────────────────────

export function VatSettingsModal({ settings, isOpen, onClose }: { settings: VatSettingsRecord; isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <WorkspaceModal title={t('vat.settings.title')} isOpen={isOpen} onClose={onClose} wide>
      {isOpen && <VatSettingsForm settings={settings} onClose={onClose} />}
    </WorkspaceModal>
  );
}

function VatSettingsForm({ settings, onClose }: { settings: VatSettingsRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveVatSettings();
  const [form, setForm] = useState({
    vatNumber: settings.vatNumber ?? '',
    legalName: settings.legalName ?? '',
    declarant: settings.declarant ?? '',
    branch: String(settings.branch),
    salesGrouping: settings.salesGrouping,
    coefficient: settings.coefficient.toFixed(2),
  });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const coefficient = Number(form.coefficient.replace(',', '.'));
  const branch = Number(form.branch);
  const valid = coefficient >= 0 && coefficient <= 1 && Number.isInteger(branch) && branch >= 0 && branch <= 9999;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({
        vatNumber: form.vatNumber.trim() || null,
        legalName: form.legalName.trim() || null,
        declarant: form.declarant.trim() || null,
        branch,
        salesGrouping: form.salesGrouping,
        coefficient,
      });
      toast.success(t('vat.settings.saved'));
      onClose();
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label={t('vat.settings.vatNumber')}>
          <input value={form.vatNumber} onChange={(event) => set('vatNumber', event.target.value)} placeholder="BG123456789" maxLength={15} className={cn(inputClass, 'font-mono')} />
        </FilterField>
        <FilterField label={t('vat.settings.legalName')}>
          <input value={form.legalName} onChange={(event) => set('legalName', event.target.value)} placeholder={settings.companyName} maxLength={50} className={inputClass} />
        </FilterField>
        <FilterField label={t('vat.settings.declarant')} className="sm:col-span-2">
          <input value={form.declarant} onChange={(event) => set('declarant', event.target.value)} maxLength={50} className={inputClass} />
        </FilterField>
        <FilterField label={t('vat.settings.salesGrouping')}>
          <Select<VatSalesGrouping>
            value={form.salesGrouping}
            onChange={(value) => setForm((current) => ({ ...current, salesGrouping: value }))}
            options={VAT_SALES_GROUPINGS.map((value) => ({ value, label: t(`vat.settings.grouping.${value}`) }))}
          />
        </FilterField>
        <FilterField label={t('vat.settings.coefficient')}>
          <input value={form.coefficient} onChange={(event) => set('coefficient', event.target.value)} inputMode="decimal" className={cn(inputClass, 'font-mono')} />
        </FilterField>
        <FilterField label={t('vat.settings.branch')}>
          <input value={form.branch} onChange={(event) => set('branch', event.target.value)} inputMode="numeric" className={cn(inputClass, 'font-mono')} />
        </FilterField>
      </div>
      <p className="font-sans text-[0.76rem] text-slate-500">{t('vat.settings.hint')}</p>
      <FormActions onCancel={onClose} busy={save.isPending} disabled={!valid} />
    </form>
  );
}

// ─── Manual ledger entry ─────────────────────────────────────────────────────

export type EntryDraft = { id: string | null; ledger: VatLedger; period: string } & Partial<Omit<VatEntryRecord, 'id' | 'ledger' | 'period'>>;

export function VatEntryModal({ draft, lang, onClose }: { draft: EntryDraft | null; lang: ReportLang; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <WorkspaceModal title={draft?.id ? t('vat.entries.edit') : t('vat.entries.add')} isOpen={draft !== null} onClose={onClose} wide>
      {draft && <VatEntryForm key={draft.id ?? 'new'} draft={draft} lang={lang} onClose={onClose} />}
    </WorkspaceModal>
  );
}

function VatEntryForm({ draft, lang, onClose }: { draft: EntryDraft; lang: ReportLang; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveVatEntry();
  const [ledger, setLedger] = useState<VatLedger>(draft.ledger);
  const [form, setForm] = useState({
    documentType: draft.documentType ?? '01',
    number: draft.number ?? '',
    issuedOn: draft.issuedOn ?? `${draft.period}-01`,
    partnerTaxId: draft.partnerTaxId ?? '',
    partnerName: draft.partnerName ?? '',
    description: draft.description ?? '',
  });
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(draft.amounts ?? {}).map(([key, value]) => [key, String(value)])),
  );
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const types: readonly string[] = ledger === 'PURCHASES' ? VAT_PURCHASE_DOCUMENT_TYPES : VAT_SALES_DOCUMENT_TYPES;
  const fields: readonly string[] = ledger === 'PURCHASES' ? VAT_PURCHASE_FIELDS : VAT_SALES_FIELDS;
  const labels = (ledger === 'PURCHASES' ? VAT_PURCHASE_FIELD_LABELS : VAT_SALES_FIELD_LABELS) as Record<string, Record<ReportLang, string> & { column: number }>;
  const parsed = Object.fromEntries(
    fields.flatMap((field) => {
      const raw = (amounts[field] ?? '').trim().replace(',', '.');
      return raw ? [[field, Number(raw)]] : [];
    }),
  );
  const amountsValid = Object.values(parsed).every((value) => Number.isFinite(value) && Math.round(value * 100) === value * 100);
  const valid = form.number.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(form.issuedOn) && amountsValid;

  const changeLedger = (value: VatLedger) => {
    setLedger(value);
    setAmounts({});
    const allowed: readonly string[] = value === 'PURCHASES' ? VAT_PURCHASE_DOCUMENT_TYPES : VAT_SALES_DOCUMENT_TYPES;
    if (!allowed.includes(form.documentType)) set('documentType', '01');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({
        id: draft.id,
        ledger,
        period: draft.period,
        documentType: form.documentType,
        number: form.number.trim(),
        issuedOn: form.issuedOn,
        partnerTaxId: form.partnerTaxId.trim() || null,
        partnerName: form.partnerName.trim() || null,
        description: form.description.trim() || null,
        amounts: parsed,
      });
      toast.success(t('vat.entries.saved'));
      onClose();
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="font-sans text-[0.78rem] text-slate-500">{t('vat.entries.hint', { period: monthLabel(draft.period, lang) })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label={t('vat.entries.ledger')}>
          <Select<VatLedger>
            value={ledger}
            onChange={changeLedger}
            options={[
              { value: 'PURCHASES', label: t('vat.tabs.purchases') },
              { value: 'SALES', label: t('vat.tabs.sales') },
            ]}
            disabled={draft.id !== null}
          />
        </FilterField>
        <FilterField label={t('vat.cols.type')}>
          <Select value={form.documentType} onChange={(value) => set('documentType', value)} options={types.map((code) => ({ value: code, label: `${code} · ${VAT_DOCUMENT_TYPES[code][lang]}` }))} />
        </FilterField>
        <FilterField label={t('vat.cols.number')}>
          <input value={form.number} onChange={(event) => set('number', event.target.value)} maxLength={20} className={cn(inputClass, 'font-mono')} />
        </FilterField>
        <FilterField label={t('vat.cols.date')}>
          <input type="date" value={form.issuedOn} onChange={(event) => set('issuedOn', event.target.value)} className={cn(inputClass, 'font-mono')} />
        </FilterField>
        <FilterField label={t('vat.cols.partnerTaxId')}>
          <input value={form.partnerTaxId} onChange={(event) => set('partnerTaxId', event.target.value)} maxLength={20} className={cn(inputClass, 'font-mono')} />
        </FilterField>
        <FilterField label={t('vat.cols.partnerName')}>
          <input value={form.partnerName} onChange={(event) => set('partnerName', event.target.value)} maxLength={120} className={inputClass} />
        </FilterField>
        <FilterField label={t('vat.cols.description')} className="sm:col-span-2">
          <input value={form.description} onChange={(event) => set('description', event.target.value)} maxLength={120} className={inputClass} />
        </FilterField>
      </div>
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field} className="flex items-center justify-between gap-2">
            <span className="min-w-0 font-sans text-[0.76rem] text-slate-600">
              <span className="mr-1 font-mono text-slate-400">{field}</span>
              {labels[field][lang]}
            </span>
            <input
              value={amounts[field] ?? ''}
              onChange={(event) => setAmounts((current) => ({ ...current, [field]: event.target.value }))}
              inputMode="decimal"
              placeholder="0.00"
              className={cn(inputClass, 'h-9 w-32 shrink-0 text-right font-mono')}
            />
          </label>
        ))}
      </div>
      {!amountsValid && <p className="font-sans text-[0.76rem] text-ops-danger">{t('vat.entries.badAmount')}</p>}
      <FormActions onCancel={onClose} busy={save.isPending} disabled={!valid} />
    </form>
  );
}

// ─── Purchase document treatment ─────────────────────────────────────────────

export function VatTreatmentModal({ row, lang, onClose }: { row: VatLedgerRow | null; lang: ReportLang; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <WorkspaceModal title={t('vat.treatment.title')} isOpen={row !== null} onClose={onClose}>
      {row && <VatTreatmentForm key={row.key} row={row} lang={lang} onClose={onClose} />}
    </WorkspaceModal>
  );
}

function VatTreatmentForm({ row, lang, onClose }: { row: VatLedgerRow; lang: ReportLang; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSetVatDocumentTreatment();
  const natural = vatPeriodOf(row.date);
  const [credit, setCredit] = useState<VatCredit | ''>(row.creditOverride && row.credit ? row.credit : '');
  const [period, setPeriod] = useState(row.periodOverride ?? natural);
  const periods = Array.from({ length: 13 }, (_, index) => shiftVatPeriod(natural, index));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({ id: row.sourceId!, vatCredit: credit || null, vatPeriod: period === natural ? null : period });
      toast.success(t('vat.treatment.saved'));
      onClose();
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="font-sans text-[0.8rem] text-slate-600">
        <span className="font-mono">{row.number}</span> · {row.partnerName ?? '—'} · {row.date}
      </p>
      <FilterField label={t('vat.treatment.credit')}>
        <Select<VatCredit | ''>
          value={credit}
          onChange={setCredit}
          options={[
            { value: '', label: t('vat.treatment.auto'), hint: t('vat.treatment.autoHint') },
            ...VAT_CREDITS.map((value) => ({ value, label: VAT_CREDIT_LABELS[value][lang], hint: t(`vat.treatment.hints.${value}`) })),
          ]}
        />
      </FilterField>
      <FilterField label={t('vat.treatment.period')}>
        <Select
          value={period}
          onChange={setPeriod}
          options={periods.map((value, index) => ({ value, label: monthLabel(value, lang), hint: index === 0 ? t('vat.treatment.documentMonth') : undefined }))}
        />
      </FilterField>
      <p className="font-sans text-[0.76rem] text-slate-500">{t('vat.treatment.periodHint')}</p>
      <FormActions onCancel={onClose} busy={save.isPending} />
    </form>
  );
}
