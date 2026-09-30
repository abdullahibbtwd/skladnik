import React, { useEffect, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  MAX_PRINT_FOOTER_LENGTH,
  MAX_PRINT_SIGNATURES,
  MAX_SERIES_PADDING,
  MAX_SERIES_PREFIX_LENGTH,
  formatSeriesNumber,
  type CompanyProfile,
  type DocumentSeriesRecord,
  type PrintTemplate,
} from '@skladnik/shared';
import { usePermissions } from '../../lib/permissions';
import { useCompanySettingsQuery, useSaveDocumentSeries, useSavePrintTemplate } from '../../lib/workspace-session';
import { FieldLabel, textFieldClass } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { GhostButton, GlassPanel, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';

const cellInput =
  'h-9 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[0.82rem] text-ops-ink outline-none focus:border-ops-teal/50 disabled:bg-ops-canvas';

const SeriesRow: React.FC<{ series: DocumentSeriesRecord; canEdit: boolean }> = ({ series, canEdit }) => {
  const { t } = useTranslation();
  const saveSeries = useSaveDocumentSeries();
  const [prefix, setPrefix] = useState(series.prefix);
  const [padding, setPadding] = useState(String(series.padding));
  const [nextNumber, setNextNumber] = useState(String(series.nextNumber));
  const [resetYearly, setResetYearly] = useState(series.resetYearly);

  useEffect(() => {
    setPrefix(series.prefix);
    setPadding(String(series.padding));
    setNextNumber(String(series.nextNumber));
    setResetYearly(series.resetYearly);
  }, [series]);

  const paddingValue = Number(padding);
  const nextValue = Number(nextNumber);
  const valid =
    Number.isInteger(paddingValue) && paddingValue >= 1 && paddingValue <= MAX_SERIES_PADDING && Number.isInteger(nextValue) && nextValue >= 1;
  const changed =
    prefix !== series.prefix ||
    paddingValue !== series.padding ||
    nextValue !== series.nextNumber ||
    resetYearly !== series.resetYearly;

  const save = async () => {
    try {
      await saveSeries.mutateAsync({
        key: series.key,
        prefix: prefix.trim(),
        padding: paddingValue,
        nextNumber: nextValue,
        resetYearly,
      });
      toast.success(t('numbering.saved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.couldNotSave'));
    }
  };

  return (
    <tr className={tableRowClass()}>
      <td className="px-5 py-3 font-display text-[0.84rem] font-medium text-ops-ink">{t(`numbering.series.${series.key}`)}</td>
      <td className="px-3 py-3">
        <input
          aria-label={t('numbering.prefix')}
          value={prefix}
          maxLength={MAX_SERIES_PREFIX_LENGTH}
          disabled={!canEdit}
          onChange={(event) => setPrefix(event.target.value)}
          className={`${cellInput} w-24`}
        />
      </td>
      <td className="px-3 py-3">
        <input
          aria-label={t('numbering.digits')}
          type="number"
          min={1}
          max={MAX_SERIES_PADDING}
          value={padding}
          disabled={!canEdit}
          onChange={(event) => setPadding(event.target.value)}
          className={`${cellInput} w-16`}
        />
      </td>
      <td className="px-3 py-3">
        <input
          aria-label={t('numbering.next')}
          type="number"
          min={1}
          value={nextNumber}
          disabled={!canEdit}
          onChange={(event) => setNextNumber(event.target.value)}
          className={`${cellInput} w-24`}
        />
      </td>
      <td className="px-3 py-3 text-center">
        <input
          aria-label={t('numbering.resetYearly')}
          type="checkbox"
          checked={resetYearly}
          disabled={!canEdit}
          onChange={(event) => setResetYearly(event.target.checked)}
          className="h-4 w-4 accent-ops-teal"
        />
      </td>
      <td className="px-3 py-3 font-mono text-[0.84rem] text-ops-accent">
        {valid ? formatSeriesNumber(prefix.trim(), nextValue, paddingValue) : '—'}
      </td>
      {canEdit && (
        <td className="px-5 py-3 text-right">
          <GhostButton disabled={!changed || !valid || saveSeries.isPending} onClick={save}>
            {t('common.save')}
          </GhostButton>
        </td>
      )}
    </tr>
  );
};

const PrintTemplateForm: React.FC<{ template: PrintTemplate; profile: CompanyProfile; canEdit: boolean }> = ({ template, profile, canEdit }) => {
  const { t } = useTranslation();
  const saveTemplate = useSavePrintTemplate();
  const [draft, setDraft] = useState(template);
  useEffect(() => setDraft(template), [template]);

  const toggle = (field: 'showCompanyDetails' | 'showPrices' | 'showBatches') => (
    <label className="flex items-center gap-2 font-sans text-[0.84rem] text-ops-ink">
      <input
        type="checkbox"
        checked={draft[field]}
        disabled={!canEdit}
        onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.checked }))}
      />
      {t(`printTemplate.${field}`)}
    </label>
  );

  const setSignature = (index: number, value: string) =>
    setDraft((prev) => ({ ...prev, signatures: prev.signatures.map((label, at) => (at === index ? value : label)) }));

  const save = async () => {
    try {
      await saveTemplate.mutateAsync({ ...draft, signatures: draft.signatures.map((label) => label.trim()).filter(Boolean) });
      toast.success(t('printTemplate.saved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.couldNotSave'));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {toggle('showCompanyDetails')}
          {toggle('showPrices')}
          {toggle('showBatches')}
        </div>
        <div>
          <p className="mb-1.5 font-display text-[0.78rem] font-medium text-slate-600">{t('printTemplate.signatures')}</p>
          <div className="flex flex-col gap-2">
            {draft.signatures.map((label, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={t('printTemplate.signatureN', { n: index + 1 })}
                  value={label}
                  maxLength={60}
                  disabled={!canEdit}
                  onChange={(event) => setSignature(index, event.target.value)}
                  className={`${textFieldClass} pl-3`}
                />
                {canEdit && (
                  <button
                    type="button"
                    aria-label={t('common.remove')}
                    onClick={() => setDraft((prev) => ({ ...prev, signatures: prev.signatures.filter((_, at) => at !== index) }))}
                    className="rounded-lg p-2 text-slate-400 hover:bg-ops-canvas hover:text-ops-danger"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {canEdit && draft.signatures.length < MAX_PRINT_SIGNATURES && (
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, signatures: [...prev.signatures, ''] }))}
                className="inline-flex w-fit items-center gap-1.5 font-display text-[0.78rem] font-medium text-ops-accent hover:underline"
              >
                <Plus size={14} />
                {t('printTemplate.addSignature')}
              </button>
            )}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="print-footer">{t('printTemplate.footer')}</FieldLabel>
          <textarea
            id="print-footer"
            rows={3}
            value={draft.footer}
            maxLength={MAX_PRINT_FOOTER_LENGTH}
            disabled={!canEdit}
            onChange={(event) => setDraft((prev) => ({ ...prev, footer: event.target.value }))}
            className={`${textFieldClass} pl-3`}
            placeholder={t('printTemplate.footerPlaceholder')}
          />
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saveTemplate.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
            >
              <Save size={15} />
              {saveTemplate.isPending ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
        )}
      </div>

      <div aria-hidden className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 font-sans text-[0.68rem] text-slate-500 shadow-sm">
        <p className="font-display text-[0.7rem] font-medium tracking-wider text-slate-400 uppercase">{t('printTemplate.preview')}</p>
        {draft.showCompanyDetails && (
          <p className="font-medium text-ops-ink">{[profile.name, profile.eik && `ЕИК ${profile.eik}`, profile.vatNumber].filter(Boolean).join(' · ')}</p>
        )}
        <p className="font-display text-[0.82rem] font-semibold text-ops-ink">{t('labels.documentType.WRITE_OFF')} ПБ-0001</p>
        <div className="border-y border-slate-100 py-2">
          <p>
            {t('printTemplate.sampleLine')}
            {draft.showBatches && ' · L2409'}
            {draft.showPrices && ' · 2,40'}
          </p>
        </div>
        <div className="flex flex-wrap gap-4 pt-3">
          {draft.signatures.filter((label) => label.trim()).map((label, index) => (
            <p key={index} className="min-w-[6rem] flex-1 border-t border-slate-300 pt-1">
              {label}
            </p>
          ))}
        </div>
        {draft.footer.trim() && <p className="whitespace-pre-line text-slate-400">{draft.footer}</p>}
      </div>
    </div>
  );
};

export const DocumentSettings: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = usePermissions().companySettings;
  const settingsQuery = useCompanySettingsQuery();
  const settings = settingsQuery.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={t('pages.companyEyebrow')} title={t('pages.documentSettingsTitle')} description={t('pages.documentSettingsDesc')} />

      <GlassPanel title={t('numbering.title')} padded={false}>
        {!settings ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-5 py-3 font-display font-medium">{t('numbering.document')}</th>
                    <th className="px-3 py-3 font-display font-medium">{t('numbering.prefix')}</th>
                    <th className="px-3 py-3 font-display font-medium">{t('numbering.digits')}</th>
                    <th className="px-3 py-3 font-display font-medium">{t('numbering.next')}</th>
                    <th className="px-3 py-3 font-display font-medium">{t('numbering.resetYearly')}</th>
                    <th className="px-3 py-3 font-display font-medium">{t('numbering.preview')}</th>
                    {canEdit && <th className="px-5 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {settings.series.map((series) => (
                    <SeriesRow key={series.key} series={series} canEdit={canEdit} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-5 py-3 font-sans text-[0.76rem] text-slate-500">{t('numbering.hint')}</p>
          </>
        )}
      </GlassPanel>

      <GlassPanel title={t('printTemplate.title')}>
        {!settings ? (
          <p className="font-sans text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <PrintTemplateForm template={settings.printTemplate} profile={settings.profile} canEdit={canEdit} />
        )}
      </GlassPanel>
    </div>
  );
};
