import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileArchive, FileImage, FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isCompanyWideRole } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { businessToday } from '../../lib/business-date';
import { archivePath, fetchArchivePreview, type ReportParams } from '../../lib/workspace-api';
import { useArchivePreviewQuery } from '../../lib/workspace-session';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { ActionButton, GlassPanel, MetricCard, MetricGrid, PageHeader } from './dashboard-ui';
import { FilterField, PeriodPicker, periodPresets, reportLang, useSiteOptions, type DateRange } from './report-ui';

/** Original photos and PDFs for a period in one ZIP, for the accountant (§4.8). */
export const ArchivePanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthRole();
  const allowed = isCompanyWideRole(role);
  const siteOptions = useSiteOptions();
  const [siteId, setSiteId] = useState('');
  const [range, setRange] = useState<DateRange>(() => periodPresets(businessToday()).lastMonth);
  const [includeUnposted, setIncludeUnposted] = useState(false);
  const [starting, setStarting] = useState(false);
  const validRange = Boolean(range.from && range.to && range.from <= range.to);
  const params = useMemo<ReportParams>(
    () => ({ lang: reportLang(i18n.language), siteId: siteId || undefined, from: range.from, to: range.to, includeUnposted }),
    [i18n.language, siteId, range, includeUnposted],
  );
  const previewQuery = useArchivePreviewQuery(params, allowed && validRange);
  const preview = previewQuery.data;

  if (!allowed) return <p className="font-sans text-[0.86rem] text-slate-500">{t('reports.archive.companyWideOnly')}</p>;

  // The ZIP can be large, so the browser downloads it directly; the preview call first refreshes the session.
  const download = async () => {
    setStarting(true);
    try {
      await fetchArchivePreview(params);
      const link = document.createElement('a');
      link.href = archivePath(params);
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reports.downloadFailed'));
    } finally {
      window.setTimeout(() => setStarting(false), 1500);
    }
  };

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
      <PageHeader eyebrow={t('reports.title')} title={t('reports.archive.title')} description={t('reports.archive.desc')} />

      <GlassPanel>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FilterField label={t('reports.site')}>
              <Select value={siteId} onChange={setSiteId} options={siteOptions} />
            </FilterField>
            <FilterField label={t('reports.period')} className="xl:col-span-2">
              <PeriodPicker value={range} onChange={setRange} />
            </FilterField>
          </div>
          <label className="flex items-center gap-2 font-sans text-[0.82rem] text-slate-600">
            <input type="checkbox" checked={includeUnposted} onChange={(event) => setIncludeUnposted(event.target.checked)} className="size-4 accent-ops-teal" />
            {t('reports.archive.includeUnposted')}
          </label>
          {!validRange && <p className="font-sans text-[0.78rem] text-ops-danger">{t('reports.badRange')}</p>}
          {previewQuery.isError && <p className="font-sans text-[0.78rem] text-ops-danger">{previewQuery.error.message}</p>}
        </div>
      </GlassPanel>

      <MetricGrid columns={3}>
        <MetricCard label={t('reports.archive.documents')} value={preview ? String(preview.documents) : '—'} hint={t('reports.archive.documentsHint')} icon={FileArchive} />
        <MetricCard label={t('reports.archive.files')} value={preview ? String(preview.files) : '—'} hint={t('reports.archive.filesHint')} icon={FileImage} />
        <MetricCard
          label={t('reports.archive.withoutScans')}
          value={preview ? String(preview.withoutScans) : '—'}
          hint={t('reports.archive.withoutScansHint')}
          icon={FileWarning}
          iconColor={preview?.withoutScans ? 'text-ops-warn' : 'text-ops-teal'}
        />
      </MetricGrid>

      <GlassPanel
        title={t('reports.archive.sample')}
        action={<ActionButton icon={Download} label={starting ? t('reports.archive.preparing') : t('reports.archive.download')} onClick={download} primary disabled={!preview?.files || starting} />}
      >
        {previewQuery.isLoading ? (
          <p className="font-sans text-[0.82rem] text-slate-500">{t('common.loading')}</p>
        ) : !preview || preview.files === 0 ? (
          <p className="font-sans text-[0.82rem] text-slate-500">{t('reports.archive.empty')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1">
              {preview.sample.map((name) => (
                <li key={name} className="truncate font-mono text-[0.76rem] text-ops-ink">
                  {name}
                </li>
              ))}
              {preview.files > preview.sample.length && (
                <li className="font-sans text-[0.74rem] text-slate-400">{t('reports.archive.more', { count: preview.files - preview.sample.length })}</li>
              )}
            </ul>
            <p className="font-sans text-[0.74rem] text-slate-500">{t('reports.archive.namesHint')}</p>
          </div>
        )}
      </GlassPanel>
    </div>
  );
};
