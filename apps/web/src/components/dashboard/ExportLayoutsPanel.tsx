import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  EXPORT_DATE_FORMATS,
  EXPORT_DECIMAL_SEPARATORS,
  EXPORT_DELIMITERS,
  EXPORT_ENCODINGS,
  REPORT_COLUMN_CHOICES,
  REPORT_KINDS,
  isReportKind,
  isSalesManager,
  reportColumnLabel,
  type ExportDelimiter,
  type ReportKind,
  type ReportLang,
} from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { cn } from '../../lib/cn';
import type { ExportProfileInput, ExportProfileRecord } from '../../lib/workspace-api';
import { useDeleteExportProfile, useExportProfilesQuery, useSaveExportProfile } from '../../lib/workspace-session';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { ActionButton, GhostButton, GlassPanel, PageHeader } from './dashboard-ui';
import { FilterField, reportLang } from './report-ui';

const RATE_COLUMN = /^(net|vat)_\d+(\.\d+)?$/;
const DELIMITER_KEYS: Record<ExportDelimiter, string> = { ';': 'semicolon', ',': 'comma', '\t': 'tab' };
const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-sans text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50';

/** A movements layout starts from the per-product summary; the journal columns can be added. */
function defaultColumns(kind: ReportKind, lang: ReportLang) {
  const keys = kind === 'movements' ? REPORT_COLUMN_CHOICES[kind].slice(0, 13) : REPORT_COLUMN_CHOICES[kind];
  return keys.map((key) => ({ key, header: reportColumnLabel(key, lang) }));
}

function newDraft(kind: ReportKind, lang: ReportLang): ExportProfileInput {
  return {
    reportKind: kind,
    name: '',
    columns: defaultColumns(kind, lang),
    delimiter: ';',
    decimalSeparator: ',',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF8_BOM',
    includeHeader: true,
  };
}

function BackLink({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)} className="flex w-fit items-center gap-1.5 font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent">
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}

export const ExportLayoutsPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const role = useAuthRole();
  const canEdit = role === 'OWNER' || role === 'ACCOUNTANT';
  const profilesQuery = useExportProfilesQuery(isSalesManager(role));
  const focusKind = search.get('kind');
  const newPath = `/app/reports/layouts/new${focusKind && isReportKind(focusKind) ? `?kind=${focusKind}` : ''}`;

  if (!isSalesManager(role)) return <p className="font-sans text-[0.86rem] text-slate-500">{t('reports.managersOnly')}</p>;

  const profiles = profilesQuery.data ?? [];
  const byKind = REPORT_KINDS.map((kind) => ({ kind, items: profiles.filter((profile) => profile.reportKind === kind) })).filter((group) => group.items.length);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BackLink to="/app/reports" label={t('reports.allReports')} />
      <PageHeader
        eyebrow={t('reports.title')}
        title={t('reports.layouts.title')}
        description={t('reports.layouts.desc')}
        action={canEdit ? <ActionButton icon={Plus} label={t('reports.layouts.new')} onClick={() => navigate(newPath)} primary /> : undefined}
      />
      {canEdit && (
        <div className="lg:hidden">
          <ActionButton icon={Plus} label={t('reports.layouts.new')} onClick={() => navigate(newPath)} primary />
        </div>
      )}
      {!canEdit && <p className="font-sans text-[0.78rem] text-slate-500">{t('reports.layouts.readOnly')}</p>}

      {profilesQuery.isLoading ? (
        <p className="font-sans text-[0.82rem] text-slate-500">{t('common.loading')}</p>
      ) : byKind.length === 0 ? (
        <GlassPanel>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <SlidersHorizontal size={22} className="text-slate-400" />
            <p className="max-w-md font-sans text-[0.82rem] text-slate-500">{t('reports.layouts.empty')}</p>
          </div>
        </GlassPanel>
      ) : (
        byKind.map((group) => (
          <GlassPanel key={group.kind} title={t(`reports.kinds.${group.kind}.title`)} padded={false}>
            <ul>
              {group.items.map((profile) => (
                <li key={profile.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[0.86rem] font-medium text-ops-ink">{profile.name}</p>
                    <p className="font-sans text-[0.74rem] text-slate-500">
                      {t('reports.layouts.columnsCount', { count: profile.columns.length })} · {formatSummary(profile, t)}
                    </p>
                  </div>
                  {canEdit && <GhostButton onClick={() => navigate(`/app/reports/layouts/${profile.id}`)}>{t('reports.layouts.edit')}</GhostButton>}
                </li>
              ))}
            </ul>
          </GlassPanel>
        ))
      )}
    </div>
  );
};

function formatSummary(profile: Pick<ExportProfileRecord, 'delimiter' | 'decimalSeparator' | 'dateFormat' | 'encoding'>, t: TFunction) {
  return [
    t(`reports.layouts.delimiters.${DELIMITER_KEYS[profile.delimiter]}`),
    `12${profile.decimalSeparator}50`,
    profile.dateFormat,
    t(`reports.layouts.encodings.${profile.encoding}`),
  ].join(' · ');
}

export const ExportLayoutEditorPanel: React.FC = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const role = useAuthRole();
  const profilesQuery = useExportProfilesQuery(isSalesManager(role));
  if (role !== 'OWNER' && role !== 'ACCOUNTANT') return <Navigate to="/app/reports/layouts" replace />;
  if (!id) return <LayoutEditor key="new" existing={null} />;
  if (profilesQuery.isLoading) return <p className="font-sans text-[0.82rem] text-slate-500">{t('common.loading')}</p>;
  const existing = profilesQuery.data?.find((profile) => profile.id === id);
  if (!existing) return <Navigate to="/app/reports/layouts" replace />;
  return <LayoutEditor key={existing.id} existing={existing} />;
};

function LayoutEditor({ existing }: { existing: ExportProfileRecord | null }) {
  const { t, i18n } = useTranslation();
  const lang = reportLang(i18n.language);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const save = useSaveExportProfile();
  const remove = useDeleteExportProfile();
  const [draft, setDraft] = useState<ExportProfileInput>(() => {
    if (existing) {
      const { id: _id, updatedAt: _updatedAt, ...rest } = existing;
      return rest;
    }
    const kind = search.get('kind');
    return newDraft(kind && isReportKind(kind) ? kind : 'vat-journal', lang);
  });
  const [addKey, setAddKey] = useState('');
  const [rateKey, setRateKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<ExportProfileInput>) => setDraft((current) => ({ ...current, ...patch }));

  const used = new Set(draft.columns.map((column) => column.key));
  const available = REPORT_COLUMN_CHOICES[draft.reportKind].filter((key) => !used.has(key));
  const moveColumn = (index: number, offset: number) => {
    const columns = [...draft.columns];
    const [column] = columns.splice(index, 1);
    columns.splice(index + offset, 0, column);
    update({ columns });
  };
  const addColumn = (key: string) => {
    if (!key || used.has(key)) return;
    update({ columns: [...draft.columns, { key, header: reportColumnLabel(key, lang) }] });
  };

  const sampleHeader = draft.columns.map((column) => column.header).join(draft.delimiter === '\t' ? ' ⇥ ' : draft.delimiter);
  const kindOptions = useMemo(() => REPORT_KINDS.map((kind) => ({ value: kind, label: t(`reports.kinds.${kind}.title`) })), [t]);

  const submit = async () => {
    setError(null);
    if (!draft.name.trim()) return setError(t('reports.layouts.nameRequired'));
    if (draft.columns.length === 0) return setError(t('reports.layouts.noColumns'));
    if (draft.columns.some((column) => !column.header.trim())) return setError(t('reports.layouts.headerRequired'));
    if (draft.delimiter === draft.decimalSeparator) return setError(t('reports.layouts.sameMarks'));
    try {
      await save.mutateAsync({ ...draft, id: existing?.id });
      toast.success(t('reports.layouts.saved'));
      navigate(`/app/reports/layouts?kind=${draft.reportKind}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const destroy = async () => {
    if (!existing) return;
    const ok = await confirm({ title: t('reports.layouts.deleteConfirm', { name: existing.name }), danger: true, confirmLabel: t('reports.layouts.delete') });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success(t('reports.layouts.deleted'));
      navigate('/app/reports/layouts');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BackLink to="/app/reports/layouts" label={t('reports.layouts.title')} />
      <PageHeader eyebrow={t('reports.layouts.title')} title={existing ? existing.name : t('reports.layouts.new')} description={t('reports.layouts.editorDesc')} />

      <GlassPanel>
        <div className="grid gap-3 md:grid-cols-2">
          <FilterField label={t('reports.layouts.report')}>
            <Select
              value={draft.reportKind}
              disabled={Boolean(existing)}
              onChange={(kind) => update({ reportKind: kind as ReportKind, columns: defaultColumns(kind as ReportKind, lang) })}
              options={kindOptions}
            />
          </FilterField>
          <FilterField label={t('reports.layouts.name')}>
            <input value={draft.name} maxLength={80} onChange={(event) => update({ name: event.target.value })} placeholder={t('reports.layouts.namePlaceholder')} className={inputClass} />
          </FilterField>
        </div>
      </GlassPanel>

      <GlassPanel title={t('reports.layouts.columns')} padded={false}>
        <ol>
          {draft.columns.map((column, index) => (
            <li key={column.key} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 last:border-0 sm:flex-nowrap sm:px-5">
              <span className="w-6 shrink-0 text-right font-mono text-[0.72rem] text-slate-400">{index + 1}</span>
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <p className="truncate font-display text-[0.8rem] font-medium text-ops-ink">{reportColumnLabel(column.key, lang)}</p>
                <p className="truncate font-mono text-[0.66rem] text-slate-400">{column.key}</p>
              </div>
              <input
                value={column.header}
                maxLength={80}
                aria-label={t('reports.layouts.header')}
                onChange={(event) => update({ columns: draft.columns.map((item, position) => (position === index ? { ...item, header: event.target.value } : item)) })}
                className={cn(inputClass, 'min-w-0 basis-full sm:basis-auto sm:flex-1')}
              />
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton label={t('reports.layouts.moveUp')} disabled={index === 0} onClick={() => moveColumn(index, -1)}>
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton label={t('reports.layouts.moveDown')} disabled={index === draft.columns.length - 1} onClick={() => moveColumn(index, 1)}>
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton label={t('reports.layouts.remove')} onClick={() => update({ columns: draft.columns.filter((_, position) => position !== index) })}>
                  <X size={14} />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="sm:w-72">
            <Select
              value={addKey}
              onChange={(key) => {
                addColumn(key);
                setAddKey('');
              }}
              placeholder={t('reports.layouts.addColumn')}
              options={available.map((key) => ({ value: key, label: reportColumnLabel(key, lang), hint: key }))}
              disabled={available.length === 0}
            />
          </div>
          {draft.reportKind === 'vat-journal' && (
            <div className="flex items-center gap-2">
              <input
                value={rateKey}
                onChange={(event) => setRateKey(event.target.value.trim())}
                placeholder="net_5"
                aria-label={t('reports.layouts.rateColumn')}
                className={cn(inputClass, 'w-32 font-mono')}
              />
              <GhostButton
                disabled={!RATE_COLUMN.test(rateKey) || used.has(rateKey)}
                onClick={() => {
                  addColumn(rateKey);
                  setRateKey('');
                }}
              >
                {t('reports.layouts.addRate')}
              </GhostButton>
            </div>
          )}
        </div>
      </GlassPanel>

      <GlassPanel title={t('reports.layouts.format')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterField label={t('reports.layouts.delimiter')}>
            <Select
              value={draft.delimiter}
              onChange={(value) => update({ delimiter: value })}
              options={EXPORT_DELIMITERS.map((value) => ({ value, label: t(`reports.layouts.delimiters.${DELIMITER_KEYS[value]}`) }))}
            />
          </FilterField>
          <FilterField label={t('reports.layouts.decimal')}>
            <Select
              value={draft.decimalSeparator}
              onChange={(value) => update({ decimalSeparator: value })}
              options={EXPORT_DECIMAL_SEPARATORS.map((value) => ({ value, label: `1234${value}50` }))}
            />
          </FilterField>
          <FilterField label={t('reports.layouts.dateFormat')}>
            <Select value={draft.dateFormat} onChange={(value) => update({ dateFormat: value })} options={EXPORT_DATE_FORMATS.map((value) => ({ value, label: value }))} />
          </FilterField>
          <FilterField label={t('reports.layouts.encoding')}>
            <Select
              value={draft.encoding}
              onChange={(value) => update({ encoding: value })}
              options={EXPORT_ENCODINGS.map((value) => ({ value, label: t(`reports.layouts.encodings.${value}`) }))}
            />
          </FilterField>
        </div>
        <label className="mt-3 flex items-center gap-2 font-sans text-[0.82rem] text-slate-600">
          <input type="checkbox" checked={draft.includeHeader} onChange={(event) => update({ includeHeader: event.target.checked })} className="size-4 accent-ops-teal" />
          {t('reports.layouts.includeHeader')}
        </label>
        <div className="mt-4 rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2.5">
          <p className="font-display text-[0.68rem] font-medium tracking-wider text-slate-500 uppercase">{t('reports.layouts.preview')}</p>
          <p className="mt-1 overflow-x-auto font-mono text-[0.74rem] whitespace-nowrap text-ops-ink">{draft.includeHeader ? sampleHeader : t('reports.layouts.noHeaderRow')}</p>
        </div>
      </GlassPanel>

      {error && <p className="font-sans text-[0.8rem] text-ops-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {existing ? (
          <button
            type="button"
            onClick={destroy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3.5 py-2.5 font-display text-[0.8rem] font-medium text-ops-danger hover:bg-ops-danger/10"
          >
            <Trash2 size={14} />
            {t('reports.layouts.delete')}
          </button>
        ) : (
          <Link to="/app/reports/layouts" className="font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent">
            {t('common.cancel')}
          </Link>
        )}
        <ActionButton icon={Save} label={t('reports.layouts.save')} onClick={submit} primary disabled={save.isPending} />
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-ops-accent disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
