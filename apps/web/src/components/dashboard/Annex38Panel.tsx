import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, FileCheck2, Globe, Receipt, RotateCcw, ShoppingBag, Store, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ANNEX38_PAYMENT_CODES,
  ANNEX38_PAYMENT_LABELS,
  ANNEX38_REFUND_LABELS,
  DEFAULT_ESHOP_PAYMENTS,
  ESHOP_NUMBER_MAX,
  ESHOP_NUMBER_PATTERN,
  ESHOP_TYPES,
  ESHOP_TYPE_LABELS,
  ESHOP_URL_MAX,
  annex38IssueMessage,
  isVatPeriod,
  shiftVatPeriod,
  type Annex38PaymentCode,
  type Annex38View,
  type ComplianceFilingRecord,
  type ComplianceIssue,
  type EShopSettings,
  type EShopType,
  type ReportLang,
} from '@skladnik/shared';
import { businessToday, formatBusinessDateTime } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { annex38DownloadPath, downloadFile, type Annex38Site } from '../../lib/workspace-api';
import {
  useAnnex38ArchiveQuery,
  useAnnex38PeriodQuery,
  useAnnex38SitesQuery,
  useGenerateAnnex38,
  useMarkAnnex38Submitted,
  useSaveEShopSettings,
} from '../../lib/workspace-session';
import { DateField } from '../ui/DateField';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { useDashboard } from './dashboard-context';
import { GlassPanel, MetricCard, MetricGrid, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';
import { FilterField, Segmented, reportLang } from './report-ui';
import { IssuesPanel, ToolbarButton } from './ComplianceShared';
import { inputClass, monthLabel } from './VatForms';
import { WorkspaceModal } from './WorkspaceModal';

type Tab = 'orders' | 'returns' | 'versions' | 'archive';

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const fileNameOf = (filing: ComplianceFilingRecord) => filing.files[0]?.name ?? `AUDIT_${filing.period.replace('-', '')}.xml`;

function status(view: Annex38View) {
  const latest = view.filings[0];
  if (!latest) return { key: 'draft' as const, version: 0 };
  if (view.changedSinceFiling) return { key: 'changed' as const, version: latest.version };
  return { key: latest.submittedAt ? ('submitted' as const) : ('generated' as const), version: latest.version };
}

export const Annex38Panel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = reportLang(i18n.language);
  const navigate = useNavigate();
  const { siteId: activeSiteId } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = businessToday();
  const lastMonth = shiftVatPeriod(today.slice(0, 7), -1);
  const requestedPeriod = searchParams.get('period') ?? '';
  const period = isVatPeriod(requestedPeriod) ? requestedPeriod : lastMonth;
  const sitesQuery = useAnnex38SitesQuery();
  const sites = sitesQuery.data?.sites ?? [];
  const requestedSite = searchParams.get('site');
  const site =
    sites.find((row) => row.id === requestedSite) ??
    sites.find((row) => row.settings && row.isActive) ??
    sites.find((row) => row.id === activeSiteId) ??
    sites.find((row) => row.isActive) ??
    null;
  const [tab, setTab] = useState<Tab>('orders');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const periodQuery = useAnnex38PeriodQuery(site?.id ?? null, period);
  const view = periodQuery.data?.period === period && periodQuery.data.site.id === site?.id ? periodQuery.data : undefined;
  const generate = useGenerateAnnex38();

  const setParam = (key: 'site' | 'period', value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    setSearchParams(params, { replace: true });
  };

  const download = async (filing: ComplianceFilingRecord) => {
    try {
      await downloadFile(annex38DownloadPath(filing.id), fileNameOf(filing));
    } catch (error) {
      toast.error(errorText(error, t('reports.downloadFailed')));
    }
  };

  const errors = view?.issues.filter((issue) => issue.severity === 'error') ?? [];
  const current = view ? status(view) : null;
  const canGenerate = Boolean(view) && errors.length === 0 && current?.key !== 'generated' && current?.key !== 'submitted';

  const runGenerate = async () => {
    if (!view || !site) return;
    const latest = view.filings[0];
    if (latest) {
      const ok = await confirm({
        title: t('vat.generate.correctionTitle', { version: latest.version + 1 }),
        description: latest.submittedAt ? t('annex38.correctionSubmitted', { version: latest.version }) : t('vat.generate.correctionDesc', { version: latest.version }),
        confirmLabel: t('annex38.generate'),
      });
      if (!ok) return;
    }
    try {
      const filing = await generate.mutateAsync({ siteId: site.id, period });
      toast.success(t('annex38.generated', { version: filing.version }));
      setTab('versions');
      await download(filing);
    } catch (error) {
      toast.error(errorText(error, t('annex38.generateFailed')));
    }
  };

  const openIssue = (issue: ComplianceIssue) => {
    if (issue.ref?.kind === 'company') navigate('/app/settings/company');
    else if (issue.ref?.kind === 'eshop') setSettingsOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader eyebrow={t('pages.auditEyebrow')} title={t('annex38.title')} description={t('annex38.desc')} />

      <GlassPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <FilterField label={t('annex38.site')} className="w-56">
              <Select<string>
                value={site?.id ?? ''}
                onChange={(value) => setParam('site', value)}
                options={sites.map((row) => ({ value: row.id, label: `${row.name}${row.settings ? ` · ${row.settings.number}` : ''}${row.isActive ? '' : ` (${t('annex38.inactive')})`}` }))}
              />
            </FilterField>
            <FilterField label={t('vat.period')}>
              <div className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-ops-canvas p-1">
                <button type="button" onClick={() => setParam('period', shiftVatPeriod(period, -1))} aria-label={t('vat.prevMonth')} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-ops-accent">
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="month"
                  value={period}
                  min="2020-01"
                  max={today.slice(0, 7)}
                  onChange={(event) => isVatPeriod(event.target.value) && setParam('period', event.target.value)}
                  aria-label={t('vat.period')}
                  className="h-7 rounded-lg border border-transparent bg-white px-2 font-mono text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50"
                />
                <button
                  type="button"
                  onClick={() => setParam('period', shiftVatPeriod(period, 1))}
                  disabled={period >= today.slice(0, 7)}
                  aria-label={t('vat.nextMonth')}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-ops-accent disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </FilterField>
            <span className="pb-2 font-display text-[0.95rem] font-semibold text-ops-ink capitalize">{monthLabel(period, lang)}</span>
            {current && <StatusChip status={current} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton icon={Globe} label={t('annex38.settings.open')} onClick={() => setSettingsOpen(true)} disabled={!site} />
            <ToolbarButton icon={FileCheck2} label={t('annex38.generate')} onClick={runGenerate} disabled={!canGenerate || generate.isPending} busy={generate.isPending} primary />
          </div>
        </div>
        {view && (
          <p className="mt-3 font-sans text-[0.76rem] text-slate-500">
            {view.company.name} · {t('annex38.eik')} <span className="font-mono">{view.company.eik ?? '—'}</span>
            {view.settings && (
              <>
                {' · '}
                {t('annex38.eShopNumber')} <span className="font-mono">{view.settings.number}</span> · {view.settings.webAddress}
              </>
            )}
            {' · '}
            {t('annex38.dueBy', { date: view.dueBy })}
          </p>
        )}
        {(periodQuery.isError || sitesQuery.isError) && <p className="mt-3 font-sans text-[0.78rem] text-ops-danger">{(periodQuery.error ?? sitesQuery.error)?.message}</p>}
      </GlassPanel>

      {site && !site.settings && <NotRegistered onRegister={() => setSettingsOpen(true)} />}

      {!view ? (
        <p className="font-sans text-[0.82rem] text-slate-500">{sitesQuery.isSuccess && sites.length === 0 ? t('annex38.noSites') : t('common.loading')}</p>
      ) : (
        <>
          <IssuesPanel
            issues={view.issues}
            lang={lang}
            onOpen={openIssue}
            message={annex38IssueMessage}
            texts={{ none: t('annex38.checksPassed'), blocking: t('annex38.checksBlocking') }}
          />

          <MetricGrid columns={4}>
            <MetricCard label={t('annex38.hl.orders')} value={String(view.totals.orders)} hint={t('annex38.hl.ordersHint', { count: view.totals.items })} icon={ShoppingBag} />
            <MetricCard label={t('annex38.hl.total')} value={formatEuro(view.totals.total)} hint={t('annex38.hl.totalHint', { net: formatEuro(view.totals.net) })} icon={Wallet} />
            <MetricCard label={t('annex38.hl.vat')} value={formatEuro(view.totals.vat)} hint={t('annex38.hl.vatHint')} icon={Receipt} />
            <MetricCard label={t('annex38.hl.returns')} value={String(view.totals.returns)} hint={t('annex38.hl.returnsHint', { amount: formatEuro(view.totals.returned) })} icon={RotateCcw} iconColor={view.totals.returns > 0 ? 'text-ops-warn' : undefined} />
          </MetricGrid>

          <Segmented<Tab>
            label={t('annex38.tabsLabel')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'orders', label: `${t('annex38.tabs.orders')} (${view.orders.length})` },
              { value: 'returns', label: `${t('annex38.tabs.returns')} (${view.returns.length})` },
              { value: 'versions', label: `${t('annex38.tabs.versions')} (${view.filings.length})` },
              { value: 'archive', label: t('annex38.tabs.archive') },
            ]}
          />

          <div className={cn(periodQuery.isFetching && 'opacity-70 transition-opacity')}>
            {tab === 'orders' && <OrdersTable view={view} lang={lang} />}
            {tab === 'returns' && <ReturnsTable view={view} lang={lang} />}
            {tab === 'versions' && <Versions filings={view.filings} changed={view.changedSinceFiling} onDownload={download} />}
            {tab === 'archive' && <Archive sites={sites} onDownload={download} />}
          </div>
        </>
      )}

      {site && <EShopSettingsModal site={site} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} lang={lang} />}
    </div>
  );
};

function StatusChip({ status: value }: { status: ReturnType<typeof status> }) {
  const { t } = useTranslation();
  const tone = {
    draft: 'border-slate-200 bg-slate-50 text-slate-600',
    generated: 'border-ops-accent/20 bg-indigo-50 text-ops-accent',
    submitted: 'border-ops-teal/20 bg-teal-50 text-ops-teal',
    changed: 'border-ops-warn/25 bg-orange-50 text-ops-warn',
  }[value.key];
  return (
    <span data-testid="annex38-status" className={cn('mb-2 inline-flex items-center rounded-full border px-2.5 py-0.5 font-display text-[0.7rem] font-medium', tone)}>
      {t(`vat.status.${value.key}`, { version: value.version })}
    </span>
  );
}

function NotRegistered({ onRegister }: { onRegister: () => void }) {
  const { t } = useTranslation();
  return (
    <GlassPanel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Store size={20} className="mt-0.5 shrink-0 text-slate-400" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-[0.9rem] font-semibold text-ops-ink">{t('annex38.notRegistered')}</p>
          <p className="font-sans text-[0.8rem] text-slate-600">{t('annex38.scope')}</p>
        </div>
        <button
          type="button"
          onClick={onRegister}
          className="shrink-0 rounded-xl border border-ops-teal/30 bg-teal-50 px-3 py-2 font-display text-[0.8rem] font-medium text-ops-teal hover:bg-teal-100"
        >
          {t('annex38.settings.register')}
        </button>
      </div>
    </GlassPanel>
  );
}

// ─── Orders and returns ──────────────────────────────────────────────────────

function OrdersTable({ view, lang }: { view: Annex38View; lang: ReportLang }) {
  const { t } = useTranslation();
  if (view.orders.length === 0) {
    return (
      <GlassPanel>
        <p className="py-4 text-center font-sans text-[0.82rem] text-slate-500">{t('annex38.noOrders')}</p>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left" data-testid="annex38-orders">
          <thead>
            <tr className={tableHeadRowClass()}>
              <th className="px-4 py-2.5">{t('annex38.col.order')}</th>
              <th className="px-3 py-2.5">{t('annex38.col.date')}</th>
              <th className="px-3 py-2.5">{t('annex38.col.items')}</th>
              <th className="px-3 py-2.5 text-right">{t('annex38.col.net')}</th>
              <th className="px-3 py-2.5 text-right">{t('annex38.col.vat')}</th>
              <th className="px-3 py-2.5 text-right">{t('annex38.col.total')}</th>
              <th className="px-4 py-2.5">{t('annex38.col.payment')}</th>
            </tr>
          </thead>
          <tbody>
            {view.orders.map((order) => (
              <tr key={order.documentId} className={cn(tableRowClass(), 'align-top')}>
                <td className="px-4 py-2.5">
                  <Link to={`/app/sales/${order.documentId}`} className="font-mono text-[0.8rem] text-ops-accent hover:underline">
                    {order.number}
                  </Link>
                  <p className="font-mono text-[0.7rem] text-slate-400">doc_n {order.docNumber}</p>
                  {order.returned && <span className="mt-1 inline-block rounded-full bg-orange-50 px-2 py-0.5 font-display text-[0.66rem] text-ops-warn">{t('annex38.returned')}</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[0.78rem] text-slate-600">{order.date}</td>
                <td className="px-3 py-2.5 font-sans text-[0.78rem] text-slate-700">
                  {order.items.map((item, index) => (
                    <p key={index} className="truncate">
                      {item.quantity} × {item.name} <span className="text-slate-400">· {item.vatRate}%</span>
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[0.8rem]">{formatEuro(order.net)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[0.8rem]">{formatEuro(order.vat)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] font-medium">{formatEuro(order.total)}</td>
                <td className="px-4 py-2.5 font-sans text-[0.76rem] text-slate-600">
                  <span className="font-mono text-slate-400">{order.payment}</span> {ANNEX38_PAYMENT_LABELS[order.payment][lang]}
                  {order.paymentReference && <p className="font-mono text-[0.7rem] text-slate-400">{order.paymentReference}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}

function ReturnsTable({ view, lang }: { view: Annex38View; lang: ReportLang }) {
  const { t } = useTranslation();
  if (view.returns.length === 0) {
    return (
      <GlassPanel>
        <p className="py-4 text-center font-sans text-[0.82rem] text-slate-500">{t('annex38.noReturns')}</p>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left" data-testid="annex38-returns">
          <thead>
            <tr className={tableHeadRowClass()}>
              <th className="px-4 py-2.5">{t('annex38.col.order')}</th>
              <th className="px-3 py-2.5">{t('annex38.col.returnedOn')}</th>
              <th className="px-3 py-2.5 text-right">{t('annex38.col.amount')}</th>
              <th className="px-4 py-2.5">{t('annex38.col.refund')}</th>
            </tr>
          </thead>
          <tbody>
            {view.returns.map((item) => (
              <tr key={item.documentId} className={tableRowClass()}>
                <td className="px-4 py-2.5">
                  <Link to={`/app/sales/${item.documentId}`} className="font-mono text-[0.8rem] text-ops-accent hover:underline">
                    {item.orderNumber}
                  </Link>
                  {!item.orderInPeriod && <p className="font-sans text-[0.7rem] text-slate-400">{t('annex38.earlierOrder')}</p>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[0.78rem] text-slate-600">{item.date}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[0.8rem]">{formatEuro(item.amount)}</td>
                <td className="px-4 py-2.5 font-sans text-[0.76rem] text-slate-600">
                  <span className="font-mono text-slate-400">{item.refund}</span> {ANNEX38_REFUND_LABELS[item.refund][lang]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}

// ─── Archive ─────────────────────────────────────────────────────────────────

function FilingRow({ filing, current, siteName, onDownload }: { filing: ComplianceFilingRecord; current?: boolean; siteName?: string; onDownload: (filing: ComplianceFilingRecord) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('bg') ? 'bg-BG' : 'en-GB';
  const file = filing.files[0];
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        {siteName && (
          <span className="font-display text-[0.9rem] font-semibold text-ops-ink">
            {filing.period} · {siteName}
          </span>
        )}
        <span className={cn('font-display text-[0.9rem] text-ops-ink', !siteName && 'font-semibold')}>{t('vat.filings.version', { version: filing.version })}</span>
        {current && <span className="rounded-full border border-ops-teal/20 bg-teal-50 px-2 py-0.5 font-display text-[0.66rem] text-ops-teal">{t('vat.filings.current')}</span>}
        {filing.version > 1 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-display text-[0.66rem] text-slate-600">{t('vat.filings.correction')}</span>}
        <span className="font-sans text-[0.76rem] text-slate-500">{t('vat.filings.generated', { at: formatBusinessDateTime(filing.createdAt, locale), by: filing.createdByName ?? '—' })}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onDownload(filing)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-display text-[0.76rem] font-medium text-ops-ink hover:border-ops-accent/30 hover:text-ops-accent"
        >
          <Download size={14} />
          {t('annex38.download')}
        </button>
      </div>
      <p className="font-sans text-[0.78rem] text-slate-600">
        {t('annex38.summary', {
          orders: filing.summary.orders ?? 0,
          total: formatEuro(Number(filing.summary.total ?? 0)),
          vat: formatEuro(Number(filing.summary.vat ?? 0)),
          returns: filing.summary.returns ?? 0,
        })}
      </p>
      {file && (
        <p className="font-mono text-[0.7rem] break-all text-slate-400" data-testid="annex38-checksum">
          {file.name} · {file.size} B · SHA-256 {file.sha256}
        </p>
      )}
      {filing.submittedAt ? (
        <p className="font-sans text-[0.78rem] text-ops-teal">{t('vat.filings.submitted', { ref: filing.submissionRef, date: filing.submittedAt.slice(0, 10), by: filing.submittedByName ?? '—' })}</p>
      ) : (
        <SubmittedForm filing={filing} />
      )}
    </li>
  );
}

function Versions({ filings, changed, onDownload }: { filings: ComplianceFilingRecord[]; changed: boolean; onDownload: (filing: ComplianceFilingRecord) => void }) {
  const { t } = useTranslation();
  if (filings.length === 0) {
    return (
      <GlassPanel>
        <p className="py-4 text-center font-sans text-[0.82rem] text-slate-500">{t('vat.filings.empty')}</p>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel padded={false} title={t('vat.filings.title')}>
      <ul className="divide-y divide-slate-100" data-testid="annex38-versions">
        {filings.map((filing, index) => (
          <FilingRow key={filing.id} filing={filing} current={index === 0 && !changed} onDownload={onDownload} />
        ))}
      </ul>
    </GlassPanel>
  );
}

function Archive({ sites, onDownload }: { sites: Annex38Site[]; onDownload: (filing: ComplianceFilingRecord) => void }) {
  const { t } = useTranslation();
  const archive = useAnnex38ArchiveQuery();
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  const filings = archive.data?.filings ?? [];
  return (
    <GlassPanel padded={false} title={t('annex38.archiveTitle')}>
      {archive.isLoading ? (
        <p className="px-5 py-4 font-sans text-[0.82rem] text-slate-500">{t('common.loading')}</p>
      ) : filings.length === 0 ? (
        <p className="px-5 py-4 font-sans text-[0.82rem] text-slate-500">{t('annex38.archiveEmpty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100" data-testid="annex38-archive">
          {filings.map((filing) => (
            <FilingRow key={filing.id} filing={filing} siteName={siteName.get(filing.scope) ?? String(filing.summary.site ?? '—')} onDownload={onDownload} />
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

function SubmittedForm({ filing }: { filing: ComplianceFilingRecord }) {
  const { t } = useTranslation();
  const mark = useMarkAnnex38Submitted();
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
      <DateField value={date} max={businessToday()} onChange={setDate} className="w-40" aria-label={t('vat.filings.date')} />
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

// ─── E-shop registration ─────────────────────────────────────────────────────

function EShopSettingsModal({ site, isOpen, onClose, lang }: { site: Annex38Site; isOpen: boolean; onClose: () => void; lang: ReportLang }) {
  const { t } = useTranslation();
  return (
    <WorkspaceModal title={t('annex38.settings.title', { site: site.name })} isOpen={isOpen} onClose={onClose} wide>
      {isOpen && <EShopSettingsForm site={site} onClose={onClose} lang={lang} />}
    </WorkspaceModal>
  );
}

function EShopSettingsForm({ site, onClose, lang }: { site: Annex38Site; onClose: () => void; lang: ReportLang }) {
  const { t } = useTranslation();
  const save = useSaveEShopSettings();
  const initial = site.settings;
  const [form, setForm] = useState({
    number: initial?.number ?? '',
    webAddress: initial?.webAddress ?? '',
    type: String(initial?.type ?? 1),
    cashPayment: String(initial?.cashPayment ?? DEFAULT_ESHOP_PAYMENTS.cashPayment),
    cardPayment: String(initial?.cardPayment ?? DEFAULT_ESHOP_PAYMENTS.cardPayment),
    posTerminal: initial?.posTerminal ?? '',
    paymentProvider: initial?.paymentProvider ?? '',
  });
  const set = (key: keyof typeof form, value: string) => setForm((currentForm) => ({ ...currentForm, [key]: value }));
  const number = form.number.trim().toUpperCase();
  const valid = /^[A-Z0-9]+$/.test(number) && number.length <= ESHOP_NUMBER_MAX && form.webAddress.trim().length > 0;
  const paymentOptions = ANNEX38_PAYMENT_CODES.map((code) => ({ value: String(code), label: `${code} · ${ANNEX38_PAYMENT_LABELS[code][lang]}` }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: EShopSettings = {
      number,
      webAddress: form.webAddress.trim(),
      type: Number(form.type) as EShopType,
      cashPayment: Number(form.cashPayment) as Annex38PaymentCode,
      cardPayment: Number(form.cardPayment) as Annex38PaymentCode,
      posTerminal: form.posTerminal.trim() || null,
      paymentProvider: form.paymentProvider.trim() || null,
    };
    try {
      await save.mutateAsync({ siteId: site.id, ...input });
      toast.success(t('annex38.settings.saved'));
      onClose();
    } catch (error) {
      toast.error(errorText(error, t('vat.saveFailed')));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="font-sans text-[0.78rem] text-slate-600">{t('annex38.scope')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterField label={t('annex38.settings.number')}>
          <input value={form.number} onChange={(event) => set('number', event.target.value)} maxLength={ESHOP_NUMBER_MAX} placeholder="RF0000000" className={cn(inputClass, 'font-mono uppercase')} />
          {number && !ESHOP_NUMBER_PATTERN.test(number) && <span className="font-sans text-[0.72rem] text-ops-warn">{t('annex38.settings.numberFormat')}</span>}
        </FilterField>
        <FilterField label={t('annex38.settings.type')}>
          <Select<string> value={form.type} onChange={(value) => set('type', value)} options={ESHOP_TYPES.map((type) => ({ value: String(type), label: `${type} · ${ESHOP_TYPE_LABELS[type][lang]}` }))} />
        </FilterField>
        <FilterField label={t('annex38.settings.webAddress')} className="sm:col-span-2">
          <input value={form.webAddress} onChange={(event) => set('webAddress', event.target.value)} maxLength={ESHOP_URL_MAX} placeholder="https://" className={inputClass} />
        </FilterField>
        <FilterField label={t('annex38.settings.cardPayment')}>
          <Select<string> value={form.cardPayment} onChange={(value) => set('cardPayment', value)} options={paymentOptions} />
        </FilterField>
        <FilterField label={t('annex38.settings.cashPayment')}>
          <Select<string> value={form.cashPayment} onChange={(value) => set('cashPayment', value)} options={paymentOptions} />
        </FilterField>
        <FilterField label={t('annex38.settings.posTerminal')}>
          <input value={form.posTerminal} onChange={(event) => set('posTerminal', event.target.value)} maxLength={200} className={cn(inputClass, 'font-mono')} />
        </FilterField>
        <FilterField label={t('annex38.settings.paymentProvider')}>
          <input value={form.paymentProvider} onChange={(event) => set('paymentProvider', event.target.value)} maxLength={200} placeholder={t('annex38.settings.providerPlaceholder')} className={inputClass} />
        </FilterField>
      </div>
      <p className="font-sans text-[0.76rem] text-slate-500">{t('annex38.settings.hint')}</p>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-display text-[0.82rem] font-medium text-ops-ink hover:text-ops-accent">
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={save.isPending || !valid}
          className="rounded-xl bg-ops-teal px-3.5 py-2 font-display text-[0.82rem] font-medium text-white shadow-[0_8px_18px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover disabled:opacity-50"
        >
          {save.isPending ? t('vat.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
