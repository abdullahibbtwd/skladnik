import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Coins,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Hourglass,
  Landmark,
  Layers,
  PackageMinus,
  Percent,
  Printer,
  Receipt,
  Scale,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  REPORT_PERIOD,
  STOCK_VALUE_GROUPINGS,
  TOP_PRODUCT_METRICS,
  TURNOVER_GROUPINGS,
  WRITE_OFF_REASONS,
  WRITE_OFF_REASON_LABELS,
  WRITE_OFF_VIEWS,
  isReportKind,
  isSalesManager,
  reportColumn,
  reportColumnLabel,
  type DocumentType,
  type ReportKind,
  type ReportLang,
  type ReportResult,
  type ReportRow,
} from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { usePermissions } from '../../lib/permissions';
import { businessToday, formatBusinessDateTime, shiftDate } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { documentPath, downloadFile, reportExportPath, type ReportParams } from '../../lib/workspace-api';
import { useExportProfilesQuery, useReportQuery } from '../../lib/workspace-session';
import { DateField } from '../ui/DateField';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { CatalogProductSearch } from './CatalogProductSearch';
import { GlassPanel, MetricCard, MetricGrid, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';
import {
  FilterField,
  PeriodPicker,
  Segmented,
  monthStart,
  reportLang,
  useCellFormatter,
  useGroupOptions,
  useSiteOptions,
  type DateRange,
} from './report-ui';

type Icon = React.ComponentType<{ size?: number; className?: string }>;

const KIND_ICONS: Record<ReportKind, Icon> = {
  turnover: TrendingUp,
  'top-products': Trophy,
  'slow-movers': Hourglass,
  'stock-value': Warehouse,
  batches: CalendarClock,
  movements: ArrowLeftRight,
  'write-offs': PackageMinus,
  'stocktake-variances': ClipboardCheck,
  'vat-summary': Percent,
  'vat-journal': BookOpen,
};

const SECTIONS: { key: string; kinds: ReportKind[] }[] = [
  { key: 'sales', kinds: ['turnover', 'top-products', 'slow-movers'] },
  { key: 'stock', kinds: ['stock-value', 'batches', 'movements'] },
  { key: 'losses', kinds: ['write-offs', 'stocktake-variances'] },
  { key: 'accounting', kinds: ['vat-summary', 'vat-journal'] },
];

const NO_GROUP_FILTER: ReportKind[] = ['vat-summary', 'vat-journal'];
const RED_WHEN_NEGATIVE = new Set(['profit', 'margin', 'variance', 'varianceValue']);

function ManagersOnly() {
  const { t } = useTranslation();
  return <p className="font-sans text-[0.86rem] text-slate-500">{t('reports.managersOnly')}</p>;
}

function HubCard({ to, icon: IconComponent, title, description }: { to: string; icon: Icon; title: string; description: string }) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-ops-accent/25 hover:shadow-[0_12px_28px_-12px_rgba(79,70,229,0.2)]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-ops-canvas text-ops-accent group-hover:border-ops-accent/20 group-hover:bg-indigo-50">
        <IconComponent size={16} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[0.9rem] font-semibold text-ops-ink">{title}</span>
        <span className="mt-0.5 block font-sans text-[0.76rem] text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

export const ReportsHubPanel: React.FC = () => {
  const { t } = useTranslation();
  const role = useAuthRole();
  const permissions = usePermissions();
  if (!isSalesManager(role)) return <ManagersOnly />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('reports.title')} description={t('reports.desc')} />
      {SECTIONS.map((section) => (
        <section key={section.key} className="flex flex-col gap-2.5">
          <h2 className="font-display text-[0.74rem] font-semibold tracking-wider text-slate-500 uppercase">{t(`reports.sections.${section.key}`)}</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {section.kinds.map((kind) => (
              <HubCard key={kind} to={`/app/reports/${kind}`} icon={KIND_ICONS[kind]} title={t(`reports.kinds.${kind}.title`)} description={t(`reports.kinds.${kind}.desc`)} />
            ))}
            {section.key === 'accounting' && (
              <>
                {permissions.vat && <HubCard to="/app/vat" icon={Landmark} title={t('vat.title')} description={t('vat.hubDesc')} />}
                {permissions.documentArchive && (
                  <HubCard to="/app/reports/archive" icon={FileArchive} title={t('reports.archive.title')} description={t('reports.archive.desc')} />
                )}
                {permissions.editLayouts && (
                  <HubCard to="/app/reports/layouts" icon={SlidersHorizontal} title={t('reports.layouts.title')} description={t('reports.layouts.desc')} />
                )}
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
};

export const ReportPanel: React.FC = () => {
  const { kind } = useParams();
  if (!kind || !isReportKind(kind)) return <Navigate to="/app/reports" replace />;
  return <ReportView key={kind} kind={kind} />;
};

type Options = {
  groupBy: string;
  metric: string;
  limit: string;
  expiringWithin: string;
  view: string;
  reason: string;
  includeMatches: boolean;
  groupId: string;
};

function initialOptions(kind: ReportKind): Options {
  return {
    groupBy: kind === 'stock-value' ? 'product' : 'day',
    metric: 'net',
    limit: '20',
    expiringWithin: '',
    view: 'line',
    reason: '',
    includeMatches: false,
    groupId: '',
  };
}

function optionParams(kind: ReportKind, options: Options): ReportParams {
  const params: ReportParams = NO_GROUP_FILTER.includes(kind) ? {} : { groupId: options.groupId || undefined };
  if (kind === 'turnover' || kind === 'stock-value') params.groupBy = options.groupBy;
  if (kind === 'top-products') Object.assign(params, { metric: options.metric, limit: options.limit });
  if (kind === 'batches') params.expiringWithin = options.expiringWithin || undefined;
  if (kind === 'write-offs') Object.assign(params, { view: options.view, reason: options.reason || undefined });
  if (kind === 'stocktake-variances') params.includeMatches = options.includeMatches || undefined;
  return params;
}

function linkType(type: string | number | null | undefined): DocumentType {
  return (type === 'PURCHASE' || typeof type !== 'string' ? 'INVOICE' : type) as DocumentType;
}

function ReportView({ kind }: { kind: ReportKind }) {
  const { t, i18n } = useTranslation();
  const lang = reportLang(i18n.language);
  const navigate = useNavigate();
  const role = useAuthRole();
  const manager = isSalesManager(role);
  const canEditLayouts = role === 'OWNER' || role === 'ACCOUNTANT';
  const today = businessToday();
  const mode = REPORT_PERIOD[kind];
  const siteOptions = useSiteOptions();
  const groupOptions = useGroupOptions();
  const format = useCellFormatter(lang);

  const [siteId, setSiteId] = useState('');
  const [range, setRange] = useState<DateRange>(() =>
    kind === 'slow-movers' ? { from: shiftDate(today, -29), to: today } : { from: monthStart(today), to: today },
  );
  const [asOf, setAsOf] = useState(today);
  const [options, setOptions] = useState<Options>(() => initialOptions(kind));
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [layoutId, setLayoutId] = useState('');
  const [downloading, setDownloading] = useState<'csv' | 'xlsx' | null>(null);
  const setOption = <K extends keyof Options>(key: K, value: Options[K]) => setOptions((current) => ({ ...current, [key]: value }));

  const validRange = mode !== 'period' || Boolean(range.from && range.to && range.from <= range.to);
  const params = useMemo<ReportParams>(
    () => ({
      lang,
      siteId: siteId || undefined,
      ...(mode === 'period' ? range : {}),
      ...(mode === 'date' ? { date: asOf } : {}),
      ...optionParams(kind, options),
      productId: kind === 'movements' ? product?.id : undefined,
    }),
    [lang, siteId, mode, range, asOf, kind, options, product],
  );
  const reportQuery = useReportQuery(kind, params, manager && validRange);
  const profilesQuery = useExportProfilesQuery(manager);
  const layouts = (profilesQuery.data ?? []).filter((profile) => profile.reportKind === kind);
  const report = reportQuery.data;

  if (!manager) return <ManagersOnly />;

  const download = async (fileFormat: 'csv' | 'xlsx') => {
    setDownloading(fileFormat);
    try {
      await downloadFile(reportExportPath(kind, { ...params, format: fileFormat, profileId: layoutId || undefined }), `${kind}.${fileFormat}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reports.downloadFailed'));
    } finally {
      setDownloading(null);
    }
  };

  const siteLine = report ? (report.scope.allSites ? t('reports.allSites') : report.scope.sites.map((site) => site.name).join(', ')) : '';
  const periodLine = report
    ? report.scope.date
      ? `${t('reports.asOf')} ${format.date(report.scope.date)}`
      : `${format.date(report.scope.from ?? '')} – ${format.date(report.scope.to ?? '')}`
    : '';
  const highlights = report ? reportHighlights(kind, report, t, Boolean(product)) : [];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <button
        type="button"
        onClick={() => navigate('/app/reports')}
        className="flex w-fit items-center gap-1.5 font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent"
      >
        <ArrowLeft size={15} />
        {t('reports.allReports')}
      </button>
      <PageHeader eyebrow={t('reports.title')} title={t(`reports.kinds.${kind}.title`)} description={t(`reports.kinds.${kind}.desc`)} />

      <GlassPanel>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FilterField label={t('reports.site')}>
              <Select value={siteId} onChange={setSiteId} options={siteOptions} />
            </FilterField>
            {mode === 'period' && (
              <FilterField label={t('reports.period')} className="xl:col-span-2">
                <PeriodPicker value={range} onChange={setRange} />
              </FilterField>
            )}
            {mode === 'date' && (
              <FilterField label={t('reports.asOf')}>
                <DateField
                  value={asOf}
                  max={today}
                  onChange={(value) => setAsOf(value || today)}
                  className="w-40"
                />
              </FilterField>
            )}
            {!NO_GROUP_FILTER.includes(kind) && !(kind === 'movements' && product) && (
              <FilterField label={t('reports.group')}>
                <Select value={options.groupId} onChange={(value) => setOption('groupId', value)} options={groupOptions} />
              </FilterField>
            )}
            {kind === 'top-products' && (
              <FilterField label={t('reports.limit')}>
                <Select
                  value={options.limit}
                  onChange={(value) => setOption('limit', value)}
                  options={['10', '20', '50', '100'].map((value) => ({ value, label: t('reports.limitN', { count: Number(value) }) }))}
                />
              </FilterField>
            )}
            {kind === 'batches' && (
              <FilterField label={t('reports.expiring')}>
                <Select
                  value={options.expiringWithin}
                  onChange={(value) => setOption('expiringWithin', value)}
                  options={[
                    { value: '', label: t('reports.expiringAll') },
                    ...['7', '30', '90'].map((value) => ({ value, label: t('reports.expiringWithin', { count: Number(value) }) })),
                  ]}
                />
              </FilterField>
            )}
            {kind === 'write-offs' && (
              <FilterField label={t('reports.reason')}>
                <Select
                  value={options.reason}
                  onChange={(value) => setOption('reason', value)}
                  options={[
                    { value: '', label: t('reports.allReasons') },
                    ...WRITE_OFF_REASONS.map((reason) => ({ value: reason, label: WRITE_OFF_REASON_LABELS[reason][lang] })),
                  ]}
                />
              </FilterField>
            )}
            {kind === 'movements' && (
              <FilterField label={t('reports.product')} className="md:col-span-2 xl:col-span-1">
                {product ? (
                  <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-ops-accent/25 bg-indigo-50 px-3">
                    <span className="min-w-0 truncate font-display text-[0.82rem] font-medium text-ops-accent">{t('reports.journalFor', { name: product.name })}</span>
                    <button type="button" onClick={() => setProduct(null)} aria-label={t('reports.clearProduct')} className="text-ops-accent hover:text-ops-ink">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <CatalogProductSearch onPick={(picked) => setProduct({ id: picked.id, name: picked.name })} placeholder={t('reports.productPlaceholder')} />
                )}
              </FilterField>
            )}
          </div>

          {(kind === 'turnover' || kind === 'stock-value' || kind === 'top-products' || kind === 'write-offs' || kind === 'stocktake-variances') && (
            <div className="flex flex-wrap items-center gap-3">
              {kind === 'turnover' && (
                <Segmented
                  label={t('reports.groupBy')}
                  value={options.groupBy}
                  onChange={(value) => setOption('groupBy', value)}
                  options={TURNOVER_GROUPINGS.map((value) => ({ value, label: t(`reports.turnoverBy.${value}`) }))}
                />
              )}
              {kind === 'stock-value' && (
                <Segmented
                  label={t('reports.groupBy')}
                  value={options.groupBy}
                  onChange={(value) => setOption('groupBy', value)}
                  options={STOCK_VALUE_GROUPINGS.map((value) => ({ value, label: t(`reports.stockBy.${value}`) }))}
                />
              )}
              {kind === 'top-products' && (
                <Segmented
                  label={t('reports.metric')}
                  value={options.metric}
                  onChange={(value) => setOption('metric', value)}
                  options={TOP_PRODUCT_METRICS.map((value) => ({ value, label: t(`reports.metrics.${value}`) }))}
                />
              )}
              {kind === 'write-offs' && (
                <Segmented
                  label={t('reports.view')}
                  value={options.view}
                  onChange={(value) => setOption('view', value)}
                  options={WRITE_OFF_VIEWS.map((value) => ({ value, label: t(`reports.views.${value}`) }))}
                />
              )}
              {kind === 'stocktake-variances' && (
                <label className="flex items-center gap-2 font-sans text-[0.82rem] text-slate-600">
                  <input
                    type="checkbox"
                    checked={options.includeMatches}
                    onChange={(event) => setOption('includeMatches', event.target.checked)}
                    className="size-4 accent-ops-teal"
                  />
                  {t('reports.includeMatches')}
                </label>
              )}
            </div>
          )}

          {!validRange && <p className="font-sans text-[0.78rem] text-ops-danger">{t('reports.badRange')}</p>}
          {reportQuery.isError && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-[0.78rem] text-ops-danger">{reportQuery.error.message}</p>
              <button
                type="button"
                onClick={() => void reportQuery.refetch()}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-display text-[0.72rem] font-medium text-ops-ink hover:border-ops-accent/40"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <FilterField label={t('reports.layout')} className="sm:w-72">
              <Select
                value={layoutId}
                onChange={setLayoutId}
                options={[{ value: '', label: t('reports.standardLayout') }, ...layouts.map((layout) => ({ value: layout.id, label: layout.name }))]}
              />
            </FilterField>
            <div className="flex flex-wrap items-center gap-2">
              {canEditLayouts && (
                <Link to={`/app/reports/layouts?kind=${kind}`} className="mr-1 font-display text-[0.76rem] font-medium text-slate-500 hover:text-ops-accent">
                  {t('reports.manageLayouts')}
                </Link>
              )}
              <ToolbarButton icon={FileText} label={t('reports.csv')} busy={downloading === 'csv'} disabled={!report || downloading !== null} onClick={() => download('csv')} />
              <ToolbarButton icon={FileSpreadsheet} label={t('reports.excel')} busy={downloading === 'xlsx'} disabled={!report || downloading !== null} onClick={() => download('xlsx')} />
              <ToolbarButton icon={Printer} label={t('reports.print')} disabled={!report} onClick={() => window.print()} primary />
            </div>
          </div>
        </div>
      </GlassPanel>

      {highlights.length > 0 && (
        <MetricGrid columns={3}>
          {highlights.map((item) => (
            <MetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} icon={item.icon} iconColor={item.tone === 'danger' ? 'text-ops-danger' : item.tone === 'warn' ? 'text-ops-warn' : 'text-ops-teal'} />
          ))}
        </MetricGrid>
      )}

      <GlassPanel
        padded={false}
        title={report ? `${siteLine} · ${periodLine}` : t(`reports.kinds.${kind}.title`)}
        action={
          report ? (
            <span className="font-sans text-[0.74rem] text-slate-500">
              {reportQuery.isFetching ? t('reports.updating') : t('reports.rows', { count: report.rows.length })}
            </span>
          ) : undefined
        }
      >
        {reportQuery.isLoading ? (
          <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('common.loading')}</p>
        ) : !report ? null : report.rows.length === 0 ? (
          <p className="px-4 py-8 text-center font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('reports.empty')}</p>
        ) : (
          <div className={cn('overflow-x-auto', reportQuery.isFetching && 'opacity-60 transition-opacity')}>
            <ReportTable
              report={report}
              lang={lang}
              format={format.cell}
              onProduct={kind === 'movements' && !product ? (row) => setProduct({ id: String(row._productId), name: String(row.product ?? '') }) : undefined}
            />
          </div>
        )}
        {report && report.notes.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            {report.notes.map((note) => (
              <p key={note} className="font-sans text-[0.74rem] text-slate-500">
                {note}
              </p>
            ))}
          </div>
        )}
      </GlassPanel>

      {report && <ReportPrint report={report} lang={lang} format={format.cell} siteLine={siteLine} periodLine={periodLine} />}
    </div>
  );
}

function ToolbarButton({
  icon: IconComponent,
  label,
  onClick,
  disabled,
  busy,
  primary,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
}) {
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

type Formatter = ReturnType<typeof useCellFormatter>['cell'];

function numeric(key: string) {
  const type = reportColumn(key).type;
  return type !== 'text' && type !== 'date';
}

function ReportTable({
  report,
  lang,
  format,
  onProduct,
}: {
  report: ReportResult;
  lang: ReportLang;
  format: Formatter;
  onProduct?: (row: ReportRow) => void;
}) {
  const { t } = useTranslation();
  const cellClass = (key: string, value: unknown, index: number, last: boolean) =>
    cn(
      'py-2.5 align-top',
      index === 0 ? 'px-4 sm:px-5' : last ? 'px-4 sm:px-5' : 'px-3',
      numeric(key) ? 'text-right font-mono text-[0.8rem] tabular-nums whitespace-nowrap' : 'font-sans text-[0.82rem] text-ops-ink',
      RED_WHEN_NEGATIVE.has(key) && typeof value === 'number' && value < 0 && 'text-ops-danger',
    );

  const renderCell = (row: ReportRow, key: string) => {
    const text = format(row[key], reportColumn(key).type);
    if (key === 'number' && row._documentId) {
      return (
        <Link to={documentPath({ id: String(row._documentId), type: linkType(row._documentType) })} className="font-mono text-[0.78rem] text-ops-accent hover:underline">
          {text}
        </Link>
      );
    }
    if (key === 'product' && onProduct && row._productId) {
      return (
        <button type="button" onClick={() => onProduct(row)} className="text-left text-ops-accent hover:underline" title={t('reports.openJournal')}>
          {text}
        </button>
      );
    }
    if (key === 'expiryStatus' && row._status) {
      const tone = row._status === 'expired' ? 'text-ops-danger' : row._status === 'within7' ? 'text-ops-warn' : row._status === 'within30' ? 'text-amber-600' : 'text-slate-500';
      return <span className={cn('font-display text-[0.76rem] font-medium', tone)}>{text}</span>;
    }
    return text;
  };

  const columns = report.columns;
  return (
    <table className="w-full text-left" style={{ minWidth: `${Math.max(36, columns.length * 7)}rem` }}>
      <thead>
        <tr className={tableHeadRowClass()}>
          {columns.map((key, index) => (
            <th
              key={key}
              className={cn('py-2.5 font-medium', index === 0 || index === columns.length - 1 ? 'px-4 sm:px-5' : 'px-3', numeric(key) && 'text-right')}
            >
              {reportColumnLabel(key, lang)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className={cn(tableRowClass(), row._total ? 'bg-ops-canvas/80 font-semibold' : undefined)}>
            {columns.map((key, index) => (
              <td key={key} className={cn(cellClass(key, row[key], index, index === columns.length - 1), row._total ? 'font-semibold' : undefined)}>
                {renderCell(row, key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {report.totals && (
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-ops-canvas/70">
            {columns.map((key, index) => (
              <td key={key} className={cn(cellClass(key, report.totals![key], index, index === columns.length - 1), 'font-semibold')}>
                {format(report.totals![key], reportColumn(key).type)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Hidden on screen; the print stylesheet shows only this, so Print and Ctrl+P give a clean A4 report. */
function ReportPrint({
  report,
  lang,
  format,
  siteLine,
  periodLine,
}: {
  report: ReportResult;
  lang: ReportLang;
  format: Formatter;
  siteLine: string;
  periodLine: string;
}) {
  const { t } = useTranslation();
  return createPortal(
    <div className="report-print">
      <header>
        <p className="report-print-company">{report.scope.company}</p>
        <h1>{report.title}</h1>
        <p className="report-print-meta">
          {siteLine} · {periodLine} · {t('reports.generated', { at: formatBusinessDateTime(report.generatedAt, lang === 'bg' ? 'bg-BG' : 'en-GB') })}
        </p>
      </header>
      <table>
        <thead>
          <tr>
            {report.columns.map((key) => (
              <th key={key} className={numeric(key) ? 'num' : undefined}>
                {reportColumnLabel(key, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={index} className={row._total ? 'total' : undefined}>
              {report.columns.map((key) => (
                <td key={key} className={numeric(key) ? 'num' : undefined}>
                  {format(row[key], reportColumn(key).type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {report.totals && (
          <tfoot>
            <tr>
              {report.columns.map((key) => (
                <td key={key} className={numeric(key) ? 'num' : undefined}>
                  {format(report.totals![key], reportColumn(key).type)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {report.notes.length > 0 && (
        <div className="report-print-notes">
          {report.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

type Highlight = { label: string; value: string; hint: string; icon: Icon; tone?: 'danger' | 'warn' };

function num(value: unknown) {
  return typeof value === 'number' ? value : 0;
}

function reportHighlights(kind: ReportKind, report: ReportResult, t: TFunction, journal: boolean): Highlight[] {
  const totals = report.totals ?? {};
  const rows = report.rows;
  const pct = (value: unknown) => (typeof value === 'number' ? `${value.toFixed(1)}%` : '—');
  switch (kind) {
    case 'turnover':
      return [
        { label: t('reports.hl.turnover'), value: formatEuro(num(totals.gross)), hint: t('reports.hl.turnoverHint', { net: formatEuro(num(totals.net)) }), icon: Wallet },
        {
          label: t('reports.hl.profit'),
          value: formatEuro(num(totals.profit)),
          hint: t('reports.hl.profitHint', { cost: formatEuro(num(totals.cost)) }),
          icon: TrendingUp,
          tone: num(totals.profit) < 0 ? 'danger' : undefined,
        },
        { label: t('reports.hl.margin'), value: pct(totals.margin), hint: t('reports.hl.marginHint'), icon: Percent },
      ];
    case 'stock-value':
      return [
        { label: t('reports.hl.stockValue'), value: formatEuro(num(totals.value)), hint: t('reports.hl.stockValueHint'), icon: Warehouse },
        { label: t('reports.hl.retailValue'), value: formatEuro(num(totals.retailValue)), hint: t('reports.hl.retailHint'), icon: Coins },
        {
          label: t('reports.hl.products'),
          value: String(typeof totals.products === 'number' ? totals.products : rows.length),
          hint: t('reports.hl.productsHint'),
          icon: Layers,
        },
      ];
    case 'batches': {
      const expired = rows.filter((row) => row._status === 'expired');
      const soon = rows.filter((row) => row._status === 'within7' || row._status === 'within30');
      return [
        { label: t('reports.hl.batchValue'), value: formatEuro(num(totals.value)), hint: t('reports.rows', { count: rows.length }), icon: Warehouse },
        {
          label: t('reports.hl.expired'),
          value: String(expired.length),
          hint: formatEuro(expired.reduce((sum, row) => sum + num(row.value), 0)),
          icon: AlertTriangle,
          tone: expired.length ? 'danger' : undefined,
        },
        {
          label: t('reports.hl.expiringSoon'),
          value: String(soon.length),
          hint: t('reports.hl.expiringSoonHint'),
          icon: CalendarClock,
          tone: soon.length ? 'warn' : undefined,
        },
      ];
    }
    case 'movements':
      if (journal) {
        return [
          { label: t('reports.hl.inQty'), value: String(totals.inQty ?? 0), hint: formatEuro(num(totals.inValue)), icon: ArrowLeftRight },
          { label: t('reports.hl.outQty'), value: String(totals.outQty ?? 0), hint: formatEuro(num(totals.outValue)), icon: PackageMinus },
          { label: t('reports.hl.balance'), value: String(totals.balance ?? 0), hint: t('reports.hl.closingHint'), icon: Scale },
        ];
      }
      return [
        { label: t('reports.hl.inValue'), value: formatEuro(num(totals.inValue)), hint: t('reports.hl.periodHint'), icon: ArrowLeftRight },
        { label: t('reports.hl.outValue'), value: formatEuro(num(totals.outValue)), hint: t('reports.hl.periodHint'), icon: PackageMinus },
        { label: t('reports.hl.closingValue'), value: formatEuro(num(totals.closingValue)), hint: t('reports.hl.closingHint'), icon: Warehouse },
      ];
    case 'slow-movers': {
      const never = rows.filter((row) => row.daysSinceSale === null || row.daysSinceSale === undefined);
      const unsold = rows.filter((row) => num(row.soldQty) <= 0);
      return [
        { label: t('reports.hl.slowValue'), value: formatEuro(num(totals.value)), hint: t('reports.rows', { count: rows.length }), icon: Warehouse },
        {
          label: t('reports.hl.unsold'),
          value: String(unsold.length),
          hint: t('reports.hl.tiedUp', { value: formatEuro(unsold.reduce((sum, row) => sum + num(row.value), 0)) }),
          icon: Hourglass,
          tone: unsold.length ? 'warn' : undefined,
        },
        { label: t('reports.hl.neverSold'), value: String(never.length), hint: t('reports.hl.neverSoldHint'), icon: AlertTriangle },
      ];
    }
    case 'write-offs':
      return [
        { label: t('reports.hl.writeOffValue'), value: formatEuro(num(totals.value)), hint: t('reports.hl.atCost'), icon: PackageMinus, tone: num(totals.value) ? 'danger' : undefined },
        {
          label: t('reports.hl.documents'),
          value: String(totals.documents ?? new Set(rows.map((row) => row._documentId)).size),
          hint: t('reports.hl.protocols'),
          icon: Receipt,
        },
        { label: t('reports.hl.lines'), value: String(totals.lines ?? rows.length), hint: t('reports.hl.linesHint'), icon: Layers },
      ];
    case 'stocktake-variances': {
      const surplus = rows.reduce((sum, row) => sum + Math.max(0, num(row.varianceValue)), 0);
      const shortage = rows.reduce((sum, row) => sum + Math.min(0, num(row.varianceValue)), 0);
      return [
        {
          label: t('reports.hl.varianceValue'),
          value: formatEuro(num(totals.varianceValue)),
          hint: t('reports.hl.varianceHint'),
          icon: Scale,
          tone: num(totals.varianceValue) < 0 ? 'danger' : undefined,
        },
        { label: t('reports.hl.surplus'), value: formatEuro(surplus), hint: t('reports.hl.atCost'), icon: TrendingUp },
        { label: t('reports.hl.shortage'), value: formatEuro(shortage), hint: t('reports.hl.atCost'), icon: AlertTriangle, tone: shortage < 0 ? 'danger' : undefined },
      ];
    }
    case 'vat-summary':
    case 'vat-journal': {
      const [purchases, sales] = rows.filter((row) => row._total);
      const purchaseVat = num(purchases?.vat);
      const salesVat = num(sales?.vat);
      return [
        { label: t('reports.hl.purchaseVat'), value: formatEuro(purchaseVat), hint: t('reports.hl.netHint', { net: formatEuro(num(purchases?.net)) }), icon: Receipt },
        { label: t('reports.hl.salesVat'), value: formatEuro(salesVat), hint: t('reports.hl.netHint', { net: formatEuro(num(sales?.net)) }), icon: Wallet },
        { label: t('reports.hl.vatDifference'), value: formatEuro(salesVat - purchaseVat), hint: t('reports.hl.vatDifferenceHint'), icon: Percent },
      ];
    }
    default:
      return [];
  }
}
