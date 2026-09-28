import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Info,
  Landmark,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Scale,
  Settings2,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  VAT_CREDIT_LABELS,
  VAT_DOCUMENT_TYPES,
  VAT_PURCHASE_FIELD_LABELS,
  VAT_PURCHASE_FIELDS,
  VAT_RETURN_CELL_LABELS,
  VAT_RETURN_SECTIONS,
  VAT_SALES_FIELD_LABELS,
  VAT_SALES_FIELDS,
  isVatPeriod,
  shiftVatPeriod,
  vatIssueMessage,
  type ComplianceFilingRecord,
  type ComplianceIssue,
  type ReportLang,
  type VatLedgerRow,
  type VatPeriodView,
  type VatReturnInputs,
} from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { businessToday, formatBusinessDateTime } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { documentPath, downloadFile, vatExportPath, vatFilingDownloadPath } from '../../lib/workspace-api';
import {
  useDeleteVatEntry,
  useGenerateVatFiling,
  useMarkVatFilingSubmitted,
  useSaveVatReturnInputs,
  useVatPeriodQuery,
} from '../../lib/workspace-session';
import { confirm } from '../ui/Dialog';
import { toast } from '../ui/Toaster';
import { GlassPanel, GhostButton, MetricCard, MetricGrid, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';
import { Segmented, reportLang, useCellFormatter } from './report-ui';
import { VatEntryModal, VatSettingsModal, VatTreatmentModal, inputClass, monthLabel, type EntryDraft } from './VatForms';

type Tab = 'return' | 'purchases' | 'sales' | 'entries' | 'filings';
type Icon = React.ComponentType<{ size?: number; className?: string }>;
type FieldLabels = Record<string, Record<ReportLang, string> & { column: number }>;

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** The usual columns plus any other field that has an amount this period (same rule as the Excel export). */
function ledgerFields(purchases: boolean, rows: VatLedgerRow[]) {
  const all: readonly string[] = purchases ? VAT_PURCHASE_FIELDS : ['10', '20', ...VAT_SALES_FIELDS];
  const always = purchases ? ['30', '31', '41', '32', '42'] : ['10', '20', '11', '21', '13', '24', '19'];
  return all.filter((field) => always.includes(field) || rows.some((row) => (row.amounts[field] ?? 0) !== 0));
}

function fieldLabel(purchases: boolean, field: string, lang: ReportLang) {
  const labels = (purchases ? VAT_PURCHASE_FIELD_LABELS : VAT_SALES_FIELD_LABELS) as FieldLabels;
  return labels[field][lang];
}

function filingStatus(view: VatPeriodView) {
  const latest = view.filings[0];
  if (!latest) return { key: 'draft' as const, latest };
  if (view.changedSinceFiling) return { key: 'changed' as const, latest };
  return { key: latest.submittedAt ? ('submitted' as const) : ('generated' as const), latest };
}

export const VatPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = reportLang(i18n.language);
  const role = useAuthRole();
  const allowed = role === 'OWNER' || role === 'ACCOUNTANT';
  const [searchParams, setSearchParams] = useSearchParams();
  const today = businessToday();
  const lastMonth = shiftVatPeriod(today.slice(0, 7), -1);
  const requested = searchParams.get('period') ?? '';
  const period = isVatPeriod(requested) ? requested : lastMonth;
  const [tab, setTab] = useState<Tab>('return');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [treatmentRow, setTreatmentRow] = useState<VatLedgerRow | null>(null);
  const [downloading, setDownloading] = useState(false);
  const periodQuery = useVatPeriodQuery(period, allowed);
  const generate = useGenerateVatFiling();
  const view = periodQuery.data?.period === period ? periodQuery.data : undefined;

  if (!allowed) return <p className="font-sans text-[0.86rem] text-slate-500">{t('vat.ownersOnly')}</p>;

  const setPeriod = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('period', next);
    setSearchParams(params, { replace: true });
  };

  const errors = view?.issues.filter((issue) => issue.severity === 'error') ?? [];
  const status = view ? filingStatus(view) : null;
  const canGenerate = Boolean(view) && errors.length === 0 && status?.key !== 'generated' && status?.key !== 'submitted';

  const downloadFiling = async (filing: ComplianceFilingRecord) => {
    try {
      await downloadFile(vatFilingDownloadPath(filing.id), `VAT_${filing.period.replace('-', '')}_v${filing.version}.zip`);
    } catch (error) {
      toast.error(errorText(error, t('reports.downloadFailed')));
    }
  };

  const runGenerate = async () => {
    if (!view) return;
    const latest = view.filings[0];
    if (latest) {
      const ok = await confirm({
        title: t('vat.generate.correctionTitle', { version: latest.version + 1 }),
        description: latest.submittedAt ? t('vat.generate.correctionSubmitted', { version: latest.version }) : t('vat.generate.correctionDesc', { version: latest.version }),
        confirmLabel: t('vat.generate.action'),
      });
      if (!ok) return;
    }
    try {
      const filing = await generate.mutateAsync(period);
      toast.success(t('vat.generate.done', { version: filing.version }));
      setTab('filings');
      await downloadFiling(filing);
    } catch (error) {
      toast.error(errorText(error, t('vat.generate.failed')));
    }
  };

  const exportLedger = tab === 'purchases' || tab === 'sales' ? tab : 'return';
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      await downloadFile(vatExportPath(period, exportLedger, lang), `VAT_${exportLedger}.xlsx`);
    } catch (error) {
      toast.error(errorText(error, t('reports.downloadFailed')));
    } finally {
      setDownloading(false);
    }
  };

  const openIssue = (issue: ComplianceIssue) => {
    const ref = issue.ref;
    if (!ref || !view) return;
    if (ref.kind === 'settings') setSettingsOpen(true);
    else if (ref.kind === 'return') setTab('return');
    else if (ref.kind === 'entry') {
      const row = [...view.purchases, ...view.sales].find((item) => item.source === 'entry' && item.sourceId === ref.id);
      if (row) setEntryDraft(entryDraftOf(row, view));
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader eyebrow={t('vat.eyebrow')} title={t('vat.title')} description={t('vat.desc')} />

      <GlassPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-ops-canvas p-1">
              <button type="button" onClick={() => setPeriod(shiftVatPeriod(period, -1))} aria-label={t('vat.prevMonth')} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-ops-accent">
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                value={period}
                max={today.slice(0, 7)}
                onChange={(event) => isVatPeriod(event.target.value) && setPeriod(event.target.value)}
                aria-label={t('vat.period')}
                className="h-8 rounded-lg border border-transparent bg-white px-2 font-mono text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50"
              />
              <button
                type="button"
                onClick={() => setPeriod(shiftVatPeriod(period, 1))}
                disabled={period >= today.slice(0, 7)}
                aria-label={t('vat.nextMonth')}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-ops-accent disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <span className="font-display text-[0.95rem] font-semibold text-ops-ink capitalize">{monthLabel(period, lang)}</span>
            {status && <StatusChip status={status} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton icon={Settings2} label={t('vat.settings.open')} onClick={() => setSettingsOpen(true)} disabled={!view} />
            <ToolbarButton icon={FileSpreadsheet} label={t('reports.excel')} onClick={downloadExcel} disabled={!view || downloading} busy={downloading} />
            <ToolbarButton icon={Printer} label={t('reports.print')} onClick={() => window.print()} disabled={!view} />
            <ToolbarButton icon={FileCheck2} label={t('vat.generate.action')} onClick={runGenerate} disabled={!canGenerate || generate.isPending} busy={generate.isPending} primary />
          </div>
        </div>
        {view && view.settings.vatNumber && (
          <p className="mt-3 font-sans text-[0.76rem] text-slate-500">
            {view.settings.legalName || view.settings.companyName} · <span className="font-mono">{view.settings.vatNumber}</span>
          </p>
        )}
        {periodQuery.isError && <p className="mt-3 font-sans text-[0.78rem] text-ops-danger">{periodQuery.error.message}</p>}
      </GlassPanel>

      {!view ? (
        <p className="font-sans text-[0.82rem] text-slate-500">{t('common.loading')}</p>
      ) : (
        <>
          <IssuesPanel issues={view.issues} lang={lang} onOpen={openIssue} />

          <MetricGrid columns={3}>
            <MetricCard label={t('vat.hl.salesVat')} value={formatEuro(view.cells['20'])} hint={t('vat.hl.salesVatHint', { base: formatEuro(view.cells['01']) })} icon={Wallet} />
            <MetricCard label={t('vat.hl.credit')} value={formatEuro(view.cells['40'])} hint={t('vat.hl.creditHint')} icon={Receipt} />
            {view.cells['60'] > 0 ? (
              <MetricCard label={t('vat.hl.refund')} value={formatEuro(view.cells['60'])} hint={t('vat.hl.refundHint')} icon={Scale} iconColor="text-ops-teal" />
            ) : (
              <MetricCard label={t('vat.hl.payable')} value={formatEuro(view.cells['50'])} hint={t('vat.hl.payableHint')} icon={Landmark} iconColor={view.cells['50'] > 0 ? 'text-ops-warn' : 'text-ops-teal'} />
            )}
          </MetricGrid>

          <Segmented<Tab>
            label={t('vat.tabsLabel')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'return', label: t('vat.tabs.return') },
              { value: 'purchases', label: `${t('vat.tabs.purchases')} (${view.purchases.length})` },
              { value: 'sales', label: `${t('vat.tabs.sales')} (${view.sales.length})` },
              { value: 'entries', label: `${t('vat.tabs.entries')} (${[...view.purchases, ...view.sales].filter((row) => row.source === 'entry').length})` },
              { value: 'filings', label: `${t('vat.tabs.filings')} (${view.filings.length})` },
            ]}
          />

          <div className={cn(periodQuery.isFetching && 'opacity-70 transition-opacity')}>
            {tab === 'return' && <ReturnTab view={view} lang={lang} />}
            {tab === 'purchases' && <PurchasesTab view={view} lang={lang} onTreat={setTreatmentRow} onEntry={(row) => setEntryDraft(entryDraftOf(row, view))} />}
            {tab === 'sales' && <LedgerTable purchases={false} rows={view.sales} lang={lang} onEntry={(row) => setEntryDraft(entryDraftOf(row, view))} />}
            {tab === 'entries' && <EntriesTab view={view} onEdit={(draft) => setEntryDraft(draft)} />}
            {tab === 'filings' && <FilingsTab view={view} onDownload={downloadFiling} />}
          </div>

          <VatPrint view={view} tab={exportLedger} lang={lang} />
          <VatSettingsModal settings={view.settings} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <VatEntryModal draft={entryDraft} lang={lang} onClose={() => setEntryDraft(null)} />
          <VatTreatmentModal row={treatmentRow} lang={lang} onClose={() => setTreatmentRow(null)} />
        </>
      )}
    </div>
  );
};

function entryDraftOf(row: VatLedgerRow, view: VatPeriodView): EntryDraft {
  const ledger = view.purchases.includes(row) ? 'PURCHASES' : 'SALES';
  const amounts = Object.fromEntries(Object.entries(row.amounts).filter(([key]) => key !== '10' && key !== '20'));
  return {
    id: row.sourceId,
    ledger,
    period: view.period,
    documentType: row.documentType,
    number: row.number,
    issuedOn: row.date,
    partnerTaxId: row.partnerTaxId,
    partnerName: row.partnerName,
    description: row.description,
    amounts,
  };
}

function ToolbarButton({ icon: IconComponent, label, onClick, disabled, busy, primary }: { icon: Icon; label: string; onClick: () => void; disabled?: boolean; busy?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 font-display text-[0.8rem] font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        primary
          ? 'bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover'
          : 'border border-slate-200 bg-white text-ops-ink shadow-sm hover:border-ops-accent/30 hover:bg-indigo-50/60 hover:text-ops-accent',
      )}
    >
      <IconComponent size={15} className={busy ? 'animate-pulse' : undefined} />
      {label}
    </button>
  );
}

function StatusChip({ status }: { status: ReturnType<typeof filingStatus> }) {
  const { t } = useTranslation();
  const tone = {
    draft: 'border-slate-200 bg-slate-50 text-slate-600',
    generated: 'border-ops-accent/20 bg-indigo-50 text-ops-accent',
    submitted: 'border-ops-teal/20 bg-teal-50 text-ops-teal',
    changed: 'border-ops-warn/25 bg-orange-50 text-ops-warn',
  }[status.key];
  return (
    <span data-testid="vat-status" className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 font-display text-[0.7rem] font-medium', tone)}>
      {t(`vat.status.${status.key}`, { version: status.latest?.version ?? 0 })}
    </span>
  );
}

// ─── Issues ──────────────────────────────────────────────────────────────────

const SEVERITY: Record<ComplianceIssue['severity'], { icon: Icon; tone: string }> = {
  error: { icon: AlertCircle, tone: 'text-ops-danger' },
  warning: { icon: AlertTriangle, tone: 'text-ops-warn' },
  info: { icon: Info, tone: 'text-slate-400' },
};

function IssuesPanel({ issues, lang, onOpen }: { issues: ComplianceIssue[]; lang: ReportLang; onOpen: (issue: ComplianceIssue) => void }) {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  const shown = issues.filter((issue) => showInfo || issue.severity !== 'info');
  if (shown.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ops-teal/20 bg-teal-50 px-4 py-3 font-sans text-[0.82rem] text-ops-teal" data-testid="vat-issues">
        {t('vat.issues.none')}
        {counts.info > 0 && (
          <button type="button" onClick={() => setShowInfo(true)} className="font-display text-[0.76rem] font-medium text-ops-accent hover:underline">
            {t('vat.issues.showNotes', { count: counts.info })}
          </button>
        )}
      </div>
    );
  }
  return (
    <GlassPanel
      padded={false}
      title={t('vat.issues.title')}
      action={
        <span className="font-sans text-[0.74rem] text-slate-500">
          {t('vat.issues.counts', { errors: counts.error, warnings: counts.warning })}
          {counts.info > 0 && (
            <button type="button" onClick={() => setShowInfo((value) => !value)} className="ml-2 text-ops-accent hover:underline">
              {showInfo ? t('vat.issues.hideNotes') : t('vat.issues.showNotes', { count: counts.info })}
            </button>
          )}
        </span>
      }
    >
      <ul className="divide-y divide-slate-100" data-testid="vat-issues">
        {counts.error > 0 && <li className="bg-rose-50/60 px-4 py-2 font-sans text-[0.76rem] font-medium text-ops-danger sm:px-5">{t('vat.issues.blocking')}</li>}
        {shown.map((issue, index) => {
          const { icon: IconComponent, tone } = SEVERITY[issue.severity];
          const ref = issue.ref;
          return (
            <li key={`${issue.code}-${index}`} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5" data-severity={issue.severity}>
              <IconComponent size={15} className={cn('mt-0.5 shrink-0', tone)} />
              <span className="min-w-0 flex-1 font-sans text-[0.82rem] text-ops-ink">{vatIssueMessage(issue, lang)}</span>
              {ref?.kind === 'document' && (
                <Link to={documentPath({ id: ref.id, type: ref.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE' })} className="shrink-0 font-display text-[0.74rem] font-medium text-ops-accent hover:underline">
                  {t('vat.issues.openDocument')}
                </Link>
              )}
              {(ref?.kind === 'settings' || ref?.kind === 'entry' || ref?.kind === 'return') && (
                <button type="button" onClick={() => onOpen(issue)} className="shrink-0 font-display text-[0.74rem] font-medium text-ops-accent hover:underline">
                  {t(`vat.issues.fix.${ref.kind}`)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}

// ─── Return ──────────────────────────────────────────────────────────────────

const INPUT_CELLS = ['70', '71', '80', '81', '82'] as const;

function ReturnTab({ view, lang }: { view: VatPeriodView; lang: ReportLang }) {
  const { t } = useTranslation();
  const format = useCellFormatter(lang);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <GlassPanel padded={false} title={t('vat.return.title')}>
        <table className="w-full text-left" data-testid="vat-return">
          <tbody>
            {VAT_RETURN_SECTIONS.map((section) => (
              <React.Fragment key={section.key}>
                <tr className={tableHeadRowClass()}>
                  <th colSpan={3} className="px-4 py-2 font-medium sm:px-5">
                    {t(`vat.return.sections.${section.key}`)}
                  </th>
                </tr>
                {section.cells.map((cell) => (
                  <tr key={cell} className={tableRowClass()} data-cell={cell}>
                    <td className="w-14 px-4 py-2 font-mono text-[0.76rem] text-slate-400 sm:px-5">{cell}</td>
                    <td className="py-2 pr-3 font-sans text-[0.82rem] text-ops-ink">{VAT_RETURN_CELL_LABELS[cell][lang]}</td>
                    <td className={cn('px-4 py-2 text-right font-mono text-[0.82rem] tabular-nums sm:px-5', (cell === '50' || cell === '60') && 'font-semibold')}>
                      {cell === '33' ? view.cells[cell].toFixed(2) : format.cell(view.cells[cell] ?? 0, 'money')}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </GlassPanel>
      <ReturnInputsForm key={`${view.period}-${JSON.stringify(view.inputs)}`} view={view} lang={lang} />
    </div>
  );
}

function ReturnInputsForm({ view, lang }: { view: VatPeriodView; lang: ReportLang }) {
  const { t } = useTranslation();
  const save = useSaveVatReturnInputs();
  const [form, setForm] = useState<Record<string, string>>(() => ({
    coefficient: view.inputs.coefficient === null ? '' : view.inputs.coefficient.toFixed(2),
    ...Object.fromEntries(INPUT_CELLS.map((cell) => [cell, view.inputs[`cell${cell}`] ? view.inputs[`cell${cell}`].toFixed(2) : ''])),
  }));
  const num = (value: string) => Number(value.trim().replace(',', '.') || 0);
  const coefficient = form.coefficient.trim() === '' ? null : num(form.coefficient);
  const valid = (coefficient === null || (coefficient >= 0 && coefficient <= 1)) && INPUT_CELLS.every((cell) => Number.isFinite(num(form[cell])) && num(form[cell]) >= 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: VatReturnInputs = {
      coefficient,
      cell70: num(form['70']),
      cell71: num(form['71']),
      cell80: num(form['80']),
      cell81: num(form['81']),
      cell82: num(form['82']),
    };
    try {
      await save.mutateAsync({ period: view.period, ...input });
      toast.success(t('vat.return.saved'));
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };

  return (
    <GlassPanel title={t('vat.return.inputs')}>
      <form onSubmit={submit} className="flex flex-col gap-3" data-testid="vat-inputs">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[0.76rem] text-slate-600">
            <span className="mr-1 font-mono text-slate-400">33</span>
            {t('vat.return.coefficient', { value: view.settings.coefficient.toFixed(2) })}
          </span>
          <input
            name="coefficient"
            value={form.coefficient}
            onChange={(event) => setForm((current) => ({ ...current, coefficient: event.target.value }))}
            placeholder={view.settings.coefficient.toFixed(2)}
            inputMode="decimal"
            className={cn(inputClass, 'text-right font-mono')}
          />
        </label>
        {INPUT_CELLS.map((cell) => (
          <label key={cell} className="flex flex-col gap-1">
            <span className="font-sans text-[0.76rem] text-slate-600">
              <span className="mr-1 font-mono text-slate-400">{cell}</span>
              {VAT_RETURN_CELL_LABELS[cell][lang]}
            </span>
            <input
              name={`cell${cell}`}
              value={form[cell]}
              onChange={(event) => setForm((current) => ({ ...current, [cell]: event.target.value }))}
              placeholder="0.00"
              inputMode="decimal"
              className={cn(inputClass, 'text-right font-mono')}
            />
          </label>
        ))}
        <p className="font-sans text-[0.74rem] text-slate-500">{t('vat.return.inputsHint')}</p>
        <button
          type="submit"
          disabled={!valid || save.isPending}
          className="rounded-xl bg-ops-teal px-3.5 py-2 font-display text-[0.82rem] font-medium text-white shadow-[0_8px_18px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover disabled:opacity-50"
        >
          {save.isPending ? t('vat.saving') : t('common.save')}
        </button>
      </form>
    </GlassPanel>
  );
}

// ─── Ledgers ─────────────────────────────────────────────────────────────────

function PurchasesTab({ view, lang, onTreat, onEntry }: { view: VatPeriodView; lang: ReportLang; onTreat: (row: VatLedgerRow) => void; onEntry: (row: VatLedgerRow) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <LedgerTable purchases rows={view.purchases} lang={lang} onTreat={onTreat} onEntry={onEntry} />
      {view.excluded.length > 0 && (
        <GlassPanel padded={false} title={t('vat.excluded.title', { count: view.excluded.length })}>
          <p className="border-b border-slate-100 px-4 py-2.5 font-sans text-[0.78rem] text-slate-500 sm:px-5">{t('vat.excluded.desc')}</p>
          <ul className="divide-y divide-slate-100">
            {view.excluded.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                <Link to={documentPath({ id: row.sourceId!, type: row.appDocumentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE' })} className="font-mono text-[0.78rem] text-ops-accent hover:underline">
                  {row.number}
                </Link>
                <span className="font-sans text-[0.82rem] text-ops-ink">{row.partnerName ?? '—'}</span>
                <span className="font-mono text-[0.76rem] text-slate-500">{row.date}</span>
                <span className="font-mono text-[0.78rem] text-slate-600">{formatEuro(row.amounts['30'] ?? 0)}</span>
                <span className="flex-1" />
                <GhostButton onClick={() => onTreat(row)}>{t('vat.excluded.include')}</GhostButton>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  );
}

function LedgerTable({
  purchases,
  rows,
  lang,
  onTreat,
  onEntry,
}: {
  purchases: boolean;
  rows: VatLedgerRow[];
  lang: ReportLang;
  onTreat?: (row: VatLedgerRow) => void;
  onEntry: (row: VatLedgerRow) => void;
}) {
  const { t } = useTranslation();
  const format = useCellFormatter(lang);
  const fields = ledgerFields(purchases, rows);
  const total = (field: string) => rows.reduce((sum, row) => sum + (row.amounts[field] ?? 0), 0);
  if (rows.length === 0) {
    return (
      <GlassPanel>
        <p className="py-4 text-center font-sans text-[0.82rem] text-slate-500">{purchases ? t('vat.ledger.emptyPurchases') : t('vat.ledger.emptySales')}</p>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel padded={false} title={purchases ? t('vat.tabs.purchases') : t('vat.tabs.sales')}>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: `${56 + fields.length * 8}rem` }} data-testid={purchases ? 'vat-purchases' : 'vat-sales'}>
          <thead>
            <tr className={tableHeadRowClass()}>
              <th className="px-4 py-2.5 font-medium sm:px-5">№</th>
              <th className="px-3 py-2.5 font-medium">{t('vat.cols.type')}</th>
              <th className="px-3 py-2.5 font-medium">{t('vat.cols.number')}</th>
              <th className="px-3 py-2.5 font-medium">{t('vat.cols.date')}</th>
              <th className="px-3 py-2.5 font-medium">{t('vat.cols.partner')}</th>
              {fields.map((field) => (
                <th key={field} className="px-3 py-2.5 text-right font-medium" title={fieldLabel(purchases, field, lang)}>
                  <span className="block font-mono normal-case">{field}</span>
                  <span className="block max-w-[9rem] truncate normal-case tracking-normal">{fieldLabel(purchases, field, lang)}</span>
                </th>
              ))}
              <th className="px-4 py-2.5 font-medium sm:px-5">{purchases ? t('vat.cols.credit') : t('vat.cols.source')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className={tableRowClass()} data-source={row.source}>
                <td className="px-4 py-2.5 font-mono text-[0.76rem] text-slate-400 sm:px-5">{index + 1}</td>
                <td className="px-3 py-2.5 font-sans text-[0.8rem] whitespace-nowrap text-ops-ink" title={VAT_DOCUMENT_TYPES[row.documentType]?.[lang]}>
                  <span className="mr-1 font-mono text-slate-400">{row.documentType}</span>
                  {VAT_DOCUMENT_TYPES[row.documentType]?.[lang]}
                </td>
                <td className="px-3 py-2.5 font-mono text-[0.78rem]">
                  {row.source === 'document' && row.sourceId ? (
                    <Link to={documentPath({ id: row.sourceId, type: row.appDocumentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE' })} className="text-ops-accent hover:underline">
                      {row.number}
                    </Link>
                  ) : (
                    row.number
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-[0.78rem] whitespace-nowrap">{format.date(row.date)}</td>
                <td className="px-3 py-2.5">
                  <span className="block font-sans text-[0.82rem] text-ops-ink">{row.partnerName ?? '—'}</span>
                  <span className="block font-mono text-[0.72rem] text-slate-500">{row.partnerTaxId ?? (row.siteName ? row.siteName : '')}</span>
                </td>
                {fields.map((field) => (
                  <td key={field} className={cn('px-3 py-2.5 text-right font-mono text-[0.8rem] whitespace-nowrap tabular-nums', (row.amounts[field] ?? 0) < 0 && 'text-ops-danger')}>
                    {row.amounts[field] ? format.cell(row.amounts[field], 'money') : ''}
                  </td>
                ))}
                <td className="px-4 py-2.5 whitespace-nowrap sm:px-5">
                  {row.source === 'document' && onTreat ? (
                    <button type="button" onClick={() => onTreat(row)} className="inline-flex items-center gap-1 font-display text-[0.74rem] font-medium text-ops-accent hover:underline">
                      {row.credit ? VAT_CREDIT_LABELS[row.credit][lang] : ''}
                      {(row.creditOverride || row.periodOverride) && <span className="text-slate-400">·{t('vat.ledger.manual')}</span>}
                      <Pencil size={12} />
                    </button>
                  ) : row.source === 'entry' ? (
                    <button type="button" onClick={() => onEntry(row)} className="inline-flex items-center gap-1 font-display text-[0.74rem] font-medium text-ops-accent hover:underline">
                      {t('vat.ledger.manualEntry')}
                      <Pencil size={12} />
                    </button>
                  ) : (
                    <span className="font-sans text-[0.76rem] text-slate-500">{row.source === 'till' ? t('vat.ledger.till') : t('vat.ledger.document')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-ops-canvas/70">
              <td colSpan={5} className="px-4 py-2.5 font-display text-[0.8rem] font-semibold sm:px-5">
                {t('vat.ledger.total')}
              </td>
              {fields.map((field) => (
                <td key={field} className="px-3 py-2.5 text-right font-mono text-[0.8rem] font-semibold whitespace-nowrap tabular-nums">
                  {format.cell(Math.round(total(field) * 100) / 100, 'money')}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </GlassPanel>
  );
}

// ─── Manual entries ──────────────────────────────────────────────────────────

function EntriesTab({ view, onEdit }: { view: VatPeriodView; onEdit: (draft: EntryDraft) => void }) {
  const { t } = useTranslation();
  const remove = useDeleteVatEntry();
  const entries = [...view.purchases, ...view.sales].filter((row) => row.source === 'entry');
  const del = async (row: VatLedgerRow) => {
    const ok = await confirm({ title: t('vat.entries.deleteTitle'), description: t('vat.entries.deleteDesc', { number: row.number }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.sourceId!);
      toast.success(t('vat.entries.deleted'));
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };
  return (
    <GlassPanel
      padded={false}
      title={t('vat.entries.title')}
      action={
        <button
          type="button"
          onClick={() => onEdit({ id: null, ledger: 'PURCHASES', period: view.period })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ops-teal px-2.5 py-1.5 font-display text-[0.76rem] font-medium text-white hover:bg-ops-teal-hover"
        >
          <Plus size={14} />
          {t('vat.entries.add')}
        </button>
      }
    >
      <p className="border-b border-slate-100 px-4 py-2.5 font-sans text-[0.78rem] text-slate-500 sm:px-5">{t('vat.entries.desc')}</p>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('vat.entries.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100" data-testid="vat-entries">
          {entries.map((row) => {
            const purchases = view.purchases.includes(row);
            return (
              <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="rounded-md border border-slate-200 bg-ops-canvas px-2 py-0.5 font-display text-[0.7rem] font-medium text-slate-600">
                  {purchases ? t('vat.tabs.purchases') : t('vat.tabs.sales')}
                </span>
                <span className="font-mono text-[0.78rem]">
                  {row.documentType} · {row.number}
                </span>
                <span className="font-sans text-[0.82rem] text-ops-ink">{row.partnerName ?? '—'}</span>
                <span className="font-mono text-[0.76rem] text-slate-500">{row.date}</span>
                <span className="flex-1" />
                <GhostButton onClick={() => onEdit(entryDraftOf(row, view))}>{t('common.edit')}</GhostButton>
                <GhostButton danger onClick={() => del(row)} disabled={remove.isPending}>
                  {t('common.delete')}
                </GhostButton>
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}

// ─── Filings ─────────────────────────────────────────────────────────────────

function FilingsTab({ view, onDownload }: { view: VatPeriodView; onDownload: (filing: ComplianceFilingRecord) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('bg') ? 'bg-BG' : 'en-GB';
  if (view.filings.length === 0) {
    return (
      <GlassPanel>
        <p className="py-4 text-center font-sans text-[0.82rem] text-slate-500">{t('vat.filings.empty')}</p>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel padded={false} title={t('vat.filings.title')}>
      <ul className="divide-y divide-slate-100" data-testid="vat-filings">
        {view.filings.map((filing, index) => (
          <li key={filing.id} className="flex flex-col gap-2 px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[0.9rem] font-semibold text-ops-ink">{t('vat.filings.version', { version: filing.version })}</span>
              {index === 0 && !view.changedSinceFiling && <span className="rounded-full border border-ops-teal/20 bg-teal-50 px-2 py-0.5 font-display text-[0.66rem] text-ops-teal">{t('vat.filings.current')}</span>}
              {filing.version > 1 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-display text-[0.66rem] text-slate-600">{t('vat.filings.correction')}</span>}
              <span className="font-sans text-[0.76rem] text-slate-500">
                {t('vat.filings.generated', { at: formatBusinessDateTime(filing.createdAt, locale), by: filing.createdByName ?? '—' })}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => onDownload(filing)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-display text-[0.76rem] font-medium text-ops-ink hover:border-ops-accent/30 hover:text-ops-accent"
              >
                <Download size={14} />
                {t('vat.filings.download')}
              </button>
            </div>
            <p className="font-sans text-[0.78rem] text-slate-600">
              {t('vat.filings.summary', {
                sales: formatEuro(Number(filing.summary['20'] ?? 0)),
                credit: formatEuro(Number(filing.summary['40'] ?? 0)),
                result: Number(filing.summary['60'] ?? 0) > 0 ? `${t('vat.hl.refund')} ${formatEuro(Number(filing.summary['60']))}` : `${t('vat.hl.payable')} ${formatEuro(Number(filing.summary['50'] ?? 0))}`,
              })}
            </p>
            <p className="font-mono text-[0.7rem] break-all text-slate-400">
              {filing.files.map((file) => `${file.name} · ${file.size} B · sha256 ${file.sha256.slice(0, 12)}…`).join('   ')}
            </p>
            {filing.submittedAt ? (
              <p className="font-sans text-[0.78rem] text-ops-teal">
                {t('vat.filings.submitted', { ref: filing.submissionRef, date: filing.submittedAt.slice(0, 10), by: filing.submittedByName ?? '—' })}
              </p>
            ) : (
              <SubmittedForm filing={filing} />
            )}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

function SubmittedForm({ filing }: { filing: ComplianceFilingRecord }) {
  const { t } = useTranslation();
  const mark = useMarkVatFilingSubmitted();
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(businessToday());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await mark.mutateAsync({ id: filing.id, submissionRef: ref.trim(), submittedAt: date });
      toast.success(t('vat.filings.markedSubmitted'));
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input value={ref} onChange={(event) => setRef(event.target.value)} placeholder={t('vat.filings.refPlaceholder')} maxLength={60} className={cn(inputClass, 'h-9 w-56')} aria-label={t('vat.filings.ref')} />
      <input type="date" value={date} max={businessToday()} onChange={(event) => setDate(event.target.value)} className={cn(inputClass, 'h-9 w-40 font-mono')} aria-label={t('vat.filings.date')} />
      <button
        type="submit"
        disabled={!ref.trim() || mark.isPending}
        className="rounded-lg border border-ops-teal/30 bg-teal-50 px-2.5 py-1.5 font-display text-[0.76rem] font-medium text-ops-teal hover:bg-teal-100 disabled:opacity-50"
      >
        {t('vat.filings.markSubmitted')}
      </button>
    </form>
  );
}

// ─── Print ───────────────────────────────────────────────────────────────────

function VatPrint({ view, tab, lang }: { view: VatPeriodView; tab: 'return' | 'purchases' | 'sales'; lang: ReportLang }) {
  const { t } = useTranslation();
  const format = useCellFormatter(lang);
  const status = filingStatus(view);
  const header = (
    <header>
      <p className="report-print-company">
        {view.settings.legalName || view.settings.companyName} · {view.settings.vatNumber ?? '—'}
      </p>
      <h1>{tab === 'return' ? t('vat.tabs.return') : tab === 'purchases' ? t('vat.tabs.purchases') : t('vat.tabs.sales')}</h1>
      <p className="report-print-meta">
        {t('vat.period')}: {monthLabel(view.period, lang)} · {t(`vat.status.${status.key}`, { version: status.latest?.version ?? 0 })} ·{' '}
        {t('reports.generated', { at: formatBusinessDateTime(new Date().toISOString(), lang === 'bg' ? 'bg-BG' : 'en-GB') })}
      </p>
    </header>
  );
  let body: React.ReactNode;
  if (tab === 'return') {
    body = (
      <table>
        <tbody>
          {VAT_RETURN_SECTIONS.flatMap((section) => [
            <tr key={section.key} className="total">
              <td colSpan={3}>{t(`vat.return.sections.${section.key}`)}</td>
            </tr>,
            ...section.cells.map((cell) => (
              <tr key={cell}>
                <td>{cell}</td>
                <td>{VAT_RETURN_CELL_LABELS[cell][lang]}</td>
                <td className="num">{cell === '33' ? view.cells[cell].toFixed(2) : format.cell(view.cells[cell] ?? 0, 'money')}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    );
  } else {
    const purchases = tab === 'purchases';
    const rows = purchases ? view.purchases : view.sales;
    const fields = ledgerFields(purchases, rows);
    body = (
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>{t('vat.cols.type')}</th>
            <th>{t('vat.cols.number')}</th>
            <th>{t('vat.cols.date')}</th>
            <th>{t('vat.cols.partnerTaxId')}</th>
            <th>{t('vat.cols.partnerName')}</th>
            {fields.map((field) => (
              <th key={field} className="num">
                {field} {fieldLabel(purchases, field, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key}>
              <td>{index + 1}</td>
              <td>{row.documentType}</td>
              <td>{row.number}</td>
              <td>{format.date(row.date)}</td>
              <td>{row.partnerTaxId ?? ''}</td>
              <td>{row.partnerName ?? ''}</td>
              {fields.map((field) => (
                <td key={field} className="num">
                  {row.amounts[field] ? format.cell(row.amounts[field], 'money') : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>{t('vat.ledger.total')}</td>
            {fields.map((field) => (
              <td key={field} className="num">
                {format.cell(Math.round(rows.reduce((sum, row) => sum + (row.amounts[field] ?? 0), 0) * 100) / 100, 'money')}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    );
  }
  return createPortal(
    <div className="report-print">
      {header}
      {body}
    </div>,
    document.body,
  );
}
