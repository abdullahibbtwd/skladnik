import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCheck, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthRole } from '../../lib/auth-store';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { formatDate, formatQty } from '../../lib/format';
import {
  createDocument,
  fillStocktake,
  type DocumentLineRecord,
  type ProductRecord,
} from '../../lib/workspace-api';
import {
  useAddDocumentLine,
  useCancelDocument,
  useDeleteDocumentLine,
  useDocumentQuery,
  useDocumentsQuery,
  usePostDocument,
  useSetStocktakeCounts,
  useSitesQuery,
  useSubmitDocument,
} from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { DateField } from '../ui/DateField';
import { confirm } from '../ui/Dialog';
import { toast } from '../ui/Toaster';
import { CatalogProductSearch } from './CatalogProductSearch';
import { useDashboard } from './dashboard-context';
import {
  ActionButton,
  GhostButton,
  GlassPanel,
  LiveBadge,
  MetricCard,
  MetricGrid,
  PageHeader,
  StatusPill,
  glassClass,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';

const inputClass =
  'h-10 w-24 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-[0.9rem] text-ops-ink outline-none focus:border-ops-teal/50 disabled:opacity-60';

function useCanWrite() {
  const role = useAuthRole();
  return role === 'OWNER' || role === 'SITE_MANAGER';
}

export const StocktakeListPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const documentsQuery = useDocumentsQuery({ type: 'STOCKTAKE', siteId: siteId || undefined });
  const [starting, setStarting] = useState(false);

  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const documents = (documentsQuery.data?.documents ?? []).filter((doc) => doc.status !== 'CANCELLED');
  const open = documents.filter((doc) => doc.status === 'DRAFT' || doc.status === 'REVIEW');
  const posted = documents.filter((doc) => doc.status === 'POSTED');

  const start = async () => {
    if (!siteId || starting) return;
    if (open.length > 0) {
      const ok = await confirm({
        title: t('stocktake.alreadyOpenTitle'),
        description: t('stocktake.alreadyOpenBody', { number: open[0].documentNumber }),
        confirmLabel: t('stocktake.startAnyway'),
      });
      if (!ok) return;
    }
    setStarting(true);
    try {
      const created = await createDocument({
        type: 'STOCKTAKE',
        siteId,
        issuedOn: new Date().toISOString().slice(0, 10),
      });
      await fillStocktake(created.document.id).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'documents'] });
      navigate(`/app/stocktake/${created.document.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('stocktake.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  const renderRows = (rows: typeof documents) => (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[26rem] text-left">
        <thead>
          <tr className={tableHeadRowClass()}>
            <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('invoices.document')}</th>
            <th className="px-3 py-2.5 font-display font-medium">{t('invoices.date')}</th>
            <th className="px-4 py-2.5 text-right font-display font-medium sm:px-5">{t('invoices.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((doc) => (
            <tr key={doc.id} className={cn(tableRowClass(), 'cursor-pointer')} onClick={() => navigate(`/app/stocktake/${doc.id}`)}>
              <td className="px-4 py-3 sm:px-5">
                <p className="font-display text-[0.82rem] font-medium text-ops-ink">{doc.documentNumber}</p>
                <p className="font-mono text-[0.66rem] text-slate-400">{t('invoices.lines', { count: doc.lineCount })}</p>
              </td>
              <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-500">{formatDate(doc.issuedOn, i18n.language)}</td>
              <td className="px-4 py-3 text-right sm:px-5">
                <StatusPill status={doc.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={siteName || undefined}
        title={t('stocktake.title')}
        description={t('stocktake.desc')}
        action={
          canWrite ? (
            <ActionButton
              icon={ClipboardCheck}
              label={starting ? t('stocktake.starting') : t('stocktake.start')}
              onClick={() => void start()}
              primary
              disabled={!siteId || starting}
            />
          ) : undefined
        }
      />

      {canWrite && (
        <div className="md:hidden">
          <ActionButton
            icon={ClipboardCheck}
            label={starting ? t('stocktake.starting') : t('stocktake.start')}
            onClick={() => void start()}
            primary
            disabled={!siteId || starting}
          />
        </div>
      )}

      {!canWrite && <FieldError>{t('app.docStaffBlocked')}</FieldError>}

      <GlassPanel title={t('stocktake.openTitle')} action={<LiveBadge>{open.length}</LiveBadge>}>
        {documentsQuery.isPending ? (
          <p className="py-6 text-center font-sans text-[0.8rem] text-slate-400">{t('invoices.loading')}</p>
        ) : open.length === 0 ? (
          <p className="py-4 font-sans text-[0.82rem] text-slate-500">{t('stocktake.noneOpen')}</p>
        ) : (
          renderRows(open)
        )}
      </GlassPanel>

      <GlassPanel title={t('stocktake.historyTitle')} action={<LiveBadge>{posted.length}</LiveBadge>}>
        {posted.length === 0 ? (
          <p className="py-4 font-sans text-[0.82rem] text-slate-500">{t('stocktake.noHistory')}</p>
        ) : (
          renderRows(posted)
        )}
      </GlassPanel>
    </div>
  );
};

type Filter = 'ALL' | 'UNCOUNTED' | 'VARIANCE';

type NewLine = { product: ProductRecord; batchNumber: string; expiryDate: string; counted: string };

export const StocktakeSheetPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const detailQuery = useDocumentQuery(id);
  const document = detailQuery.data?.document;
  const posting = detailQuery.data?.posting;
  const setCounts = useSetStocktakeCounts(id);
  const addLine = useAddDocumentLine(id);
  const deleteLine = useDeleteDocumentLine(id);
  const submitDocument = useSubmitDocument(id);
  const postDocument = usePostDocument(id);
  const cancelDocument = useCancelDocument(id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [newLine, setNewLine] = useState<NewLine | null>(null);
  const [newLineError, setNewLineError] = useState<string | null>(null);
  const saving = useRef(new Set<string>());

  useEffect(() => {
    if (document && document.type !== 'STOCKTAKE') navigate(`/app/invoices/${document.id}`, { replace: true });
  }, [document, navigate]);

  if (detailQuery.isPending) {
    return <p className="py-16 text-center font-sans text-sm text-slate-400">{t('doc.loading')}</p>;
  }
  if (!document) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-sm text-ops-danger">{t('doc.notFound')}</p>
        <button type="button" className="mt-3 font-display text-[0.8rem] text-ops-accent" onClick={() => navigate(canWrite ? '/app/stocktake' : '/app/invoices')}>
          {canWrite ? t('stocktake.backToList') : t('pages.backToList')}
        </button>
      </div>
    );
  }

  const writable = (document.status === 'DRAFT' || document.status === 'REVIEW') && canWrite;
  const posted = document.status === 'POSTED';
  const summary = document.stocktake;
  const lines = document.lines;
  const uncounted = lines.filter((line) => line.stocktake?.countedQuantity === null);
  const query = search.trim().toLowerCase();
  const visible = lines.filter((line) => {
    const st = line.stocktake;
    if (filter === 'UNCOUNTED' && st?.countedQuantity !== null) return false;
    if (filter === 'VARIANCE' && !st?.varianceQuantity) return false;
    if (posted && filter === 'ALL' && st?.countedQuantity === null) return false;
    if (!query) return true;
    return (
      (line.product?.name ?? '').toLowerCase().includes(query) ||
      (line.product?.code ?? '').toLowerCase().includes(query) ||
      (line.batchNumber ?? '').toLowerCase().includes(query)
    );
  });

  const unitLabel = (line: DocumentLineRecord) => (line.product ? t(`labels.unit.${line.product.unit}`) : '');

  const saveCount = async (line: DocumentLineRecord, raw: string) => {
    const trimmed = raw.trim().replace(',', '.');
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast.error(t('stocktake.badCount'));
      return;
    }
    if (value === (line.stocktake?.countedQuantity ?? null)) {
      setDrafts(({ [line.id]: _, ...rest }) => rest);
      return;
    }
    if (saving.current.has(line.id)) return;
    saving.current.add(line.id);
    try {
      await setCounts.mutateAsync([{ lineId: line.id, countedQuantity: value }]);
      setDrafts(({ [line.id]: _, ...rest }) => rest);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('stocktake.saveFailed'));
    } finally {
      saving.current.delete(line.id);
    }
  };

  const focusNextCount = (current: HTMLInputElement) => {
    const inputs = [...window.document.querySelectorAll<HTMLInputElement>('input[data-count-input]')];
    const next = inputs[inputs.indexOf(current) + 1];
    if (next) next.focus();
    else current.blur();
  };

  const zeroUncounted = async () => {
    const ok = await confirm({
      title: t('stocktake.zeroTitle', { count: uncounted.length }),
      description: t('stocktake.zeroBody'),
      confirmLabel: t('stocktake.zeroConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await setCounts.mutateAsync(uncounted.map((line) => ({ lineId: line.id, countedQuantity: 0 })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('stocktake.saveFailed'));
    }
  };

  const saveNewLine = async () => {
    if (!newLine) return;
    setNewLineError(null);
    const counted = Number(newLine.counted.replace(',', '.'));
    if (!(counted >= 0) || newLine.counted.trim() === '') {
      setNewLineError(t('stocktake.badCount'));
      return;
    }
    if (newLine.product.batchTracking && (!newLine.batchNumber.trim() || !newLine.expiryDate)) {
      setNewLineError(t('stocktake.batchRequired'));
      return;
    }
    try {
      await addLine.mutateAsync({
        productId: newLine.product.id,
        unitPrice: 0,
        countedQuantity: counted,
        ...(newLine.product.batchTracking
          ? { batchNumber: newLine.batchNumber.trim(), expiryDate: newLine.expiryDate }
          : {}),
      });
      setNewLine(null);
    } catch (err) {
      setNewLineError(err instanceof Error ? err.message : t('stocktake.saveFailed'));
    }
  };

  const runPost = async () => {
    const ok = await confirm({
      title: t('stocktake.postTitle'),
      description: t('stocktake.postBody', {
        counted: summary?.counted ?? 0,
        variance: summary?.linesWithVariance ?? 0,
        net: formatEuro(summary?.netValue ?? 0),
        uncounted: uncounted.length,
      }),
      confirmLabel: t('stocktake.post'),
    });
    if (!ok) return;
    try {
      if (document.status === 'DRAFT') await submitDocument.mutateAsync();
      await postDocument.mutateAsync({});
      toast.success(t('stocktake.posted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.postFailed'));
    }
  };

  const runCancel = async () => {
    const ok = await confirm({
      title: t('stocktake.cancelTitle'),
      description: t('stocktake.cancelBody'),
      confirmLabel: t('doc.cancelConfirm'),
      cancelLabel: t('common.back'),
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelDocument.mutateAsync();
      navigate('/app/stocktake', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.cancelFailed'));
    }
  };

  const varianceTone = (value: number | null | undefined) =>
    !value ? 'text-slate-400' : value < 0 ? 'text-ops-danger' : 'text-ops-teal';
  const signed = (value: number) => `${value > 0 ? '+' : ''}${formatQty(value, i18n.language)}`;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={`${posted ? t('stocktake.protocol') : t('labels.documentType.STOCKTAKE')} · ${document.site.name}`}
        title={document.documentNumber}
        description={`${formatDate(document.issuedOn, i18n.language)}${posted ? '' : ` · ${t('stocktake.sheetHint')}`}`}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <StatusPill status={document.status} />
            {posted && (
              <GhostButton onClick={() => window.print()}>
                <span className="inline-flex items-center gap-1">
                  <Printer size={13} /> {t('stocktake.print')}
                </span>
              </GhostButton>
            )}
            <GhostButton onClick={() => navigate(canWrite ? '/app/stocktake' : '/app/invoices')}>
              <span className="inline-flex items-center gap-1">
                <ArrowLeft size={13} /> {canWrite ? t('stocktake.backToList') : t('pages.backToList')}
              </span>
            </GhostButton>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 md:hidden print:hidden">
        <StatusPill status={document.status} />
        {posted && (
          <GhostButton onClick={() => window.print()}>
            <span className="inline-flex items-center gap-1">
              <Printer size={13} /> {t('stocktake.print')}
            </span>
          </GhostButton>
        )}
      </div>

      {summary && (
        <MetricGrid columns={4}>
          <MetricCard
            label={t('stocktake.counted')}
            value={`${summary.counted} / ${summary.lines}`}
            hint={uncounted.length ? t('stocktake.uncountedHint', { count: uncounted.length }) : t('stocktake.allCounted')}
            icon={ClipboardCheck}
            iconColor="text-ops-accent"
          />
          <MetricCard
            label={t('stocktake.shortage')}
            value={formatEuro(summary.shortageValue)}
            hint={t('stocktake.linesWithVariance', { count: summary.linesWithVariance })}
            icon={ClipboardCheck}
            iconColor="text-ops-danger"
          />
          <MetricCard
            label={t('stocktake.surplus')}
            value={formatEuro(summary.surplusValue)}
            hint={t('stocktake.atCost')}
            icon={ClipboardCheck}
            iconColor="text-ops-teal"
          />
          <MetricCard
            label={t('stocktake.net')}
            value={formatEuro(summary.netValue)}
            hint={posted ? t('stocktake.netPosted') : t('stocktake.netPreview')}
            icon={ClipboardCheck}
            iconColor={summary.netValue < 0 ? 'text-ops-danger' : 'text-ops-teal'}
          />
        </MetricGrid>
      )}

      <GlassPanel padded={false} title={posted ? t('stocktake.protocolLines') : t('stocktake.sheetTitle')}>
        <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-5 print:hidden">
          <label className="relative block flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('stock.search')}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3 pl-10 font-sans text-[0.86rem] text-ops-ink outline-none focus:border-ops-teal/50"
            />
          </label>
          <div className="flex gap-1.5">
            {(['ALL', 'UNCOUNTED', 'VARIANCE'] as const)
              .filter((option) => !posted || option !== 'UNCOUNTED')
              .map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={cn(
                    'rounded-lg border px-3 py-2 font-display text-[0.76rem] font-medium',
                    filter === option ? 'border-ops-accent/30 bg-indigo-50 text-ops-accent' : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  {t(`stocktake.filter.${option}`)}
                </button>
              ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center font-sans text-[0.82rem] text-slate-500 sm:px-5">
            {lines.length === 0 ? t('stocktake.emptySheet') : t('stock.noMatches')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('stocktake.item')}</th>
                  <th className="px-3 py-2.5 text-right font-display font-medium">{t('stocktake.expected')}</th>
                  <th className="px-3 py-2.5 text-right font-display font-medium">{t('stocktake.countedCol')}</th>
                  <th className="px-4 py-2.5 text-right font-display font-medium sm:px-5">{t('stocktake.variance')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => {
                  const st = line.stocktake;
                  const draft = drafts[line.id];
                  const value = draft ?? (st?.countedQuantity === null || st?.countedQuantity === undefined ? '' : String(st.countedQuantity));
                  return (
                    <tr key={line.id} className={tableRowClass()}>
                      <td className="px-4 py-2.5 sm:px-5">
                        <p className="line-clamp-2 font-display text-[0.84rem] text-ops-ink">{line.product?.name ?? '—'}</p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {line.product?.code}
                          {line.batchNumber ? ` · ${line.batchNumber}` : ''}
                          {line.expiryDate ? ` · ${formatDate(line.expiryDate, i18n.language)}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] whitespace-nowrap text-slate-600">
                        {st?.expectedQuantity === null || st?.expectedQuantity === undefined ? '—' : formatQty(st.expectedQuantity, i18n.language)}{' '}
                        <span className="text-slate-400">{unitLabel(line)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {writable ? (
                          <div className="flex items-center justify-end gap-1">
                            {st?.countedQuantity === null && draft === undefined && (st.expectedQuantity ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => void saveCount(line, String(st.expectedQuantity))}
                                className="flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-teal-50 hover:text-ops-teal print:hidden"
                                aria-label={t('stocktake.matches')}
                                title={t('stocktake.matches')}
                              >
                                <Check size={16} />
                              </button>
                            )}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={value}
                              placeholder="—"
                              aria-label={t('stocktake.countFor', { name: line.product?.name ?? '' })}
                              onChange={(event) => setDrafts((current) => ({ ...current, [line.id]: event.target.value }))}
                              onBlur={(event) => {
                                if (drafts[line.id] !== undefined) void saveCount(line, event.target.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                if (drafts[line.id] !== undefined) void saveCount(line, event.currentTarget.value);
                                focusNextCount(event.currentTarget);
                              }}
                              data-count-input
                              className={cn(inputClass, st?.countedQuantity !== null && draft === undefined && 'border-ops-teal/40 bg-teal-50/40')}
                            />
                            {(st?.expectedQuantity ?? 0) === 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await confirm({ title: t('doc.removeLineTitle'), confirmLabel: t('doc.removeConfirm'), danger: true });
                                  if (ok) await deleteLine.mutateAsync(line.id).catch((err: Error) => toast.error(err.message));
                                }}
                                className="flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-ops-danger print:hidden"
                                aria-label={t('writeOff.removeItem')}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-[0.84rem] text-ops-ink">
                            {st?.countedQuantity === null || st?.countedQuantity === undefined ? '—' : formatQty(st.countedQuantity, i18n.language)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap sm:px-5">
                        {st?.varianceQuantity === null || st?.varianceQuantity === undefined ? (
                          <span className="font-mono text-[0.8rem] text-slate-300">—</span>
                        ) : (
                          <>
                            <p className={cn('font-mono text-[0.82rem] font-medium', varianceTone(st.varianceQuantity))}>
                              {st.varianceQuantity === 0 ? '0' : signed(st.varianceQuantity)}
                            </p>
                            {st.varianceValue ? (
                              <p className={cn('font-mono text-[0.68rem]', varianceTone(st.varianceValue))}>{formatEuro(st.varianceValue)}</p>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {writable && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5 print:hidden">
            {newLine ? (
              <div className="flex flex-col gap-3">
                <p className="font-display text-[0.86rem] font-medium text-ops-ink">{newLine.product.name}</p>
                <div className="flex flex-wrap items-end gap-2.5">
                  {newLine.product.batchTracking && (
                    <>
                      <div>
                        <FieldLabel htmlFor="st-new-batch">{t('writeOff.batch')}</FieldLabel>
                        <input
                          id="st-new-batch"
                          value={newLine.batchNumber}
                          onChange={(event) => setNewLine({ ...newLine, batchNumber: event.target.value })}
                          className="h-10 w-36 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[0.86rem] outline-none focus:border-ops-teal/50"
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="st-new-expiry">{t('stocktake.expiry')}</FieldLabel>
                        <DateField
                          id="st-new-expiry"
                          value={newLine.expiryDate}
                          onChange={(value) => setNewLine({ ...newLine, expiryDate: value })}
                          className="w-40"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <FieldLabel htmlFor="st-new-count">{t('stocktake.countedCol')}</FieldLabel>
                    <input
                      id="st-new-count"
                      inputMode="decimal"
                      value={newLine.counted}
                      onChange={(event) => setNewLine({ ...newLine, counted: event.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <ActionButton icon={Plus} label={t('stocktake.addLine')} onClick={() => void saveNewLine()} primary disabled={addLine.isPending} />
                  <GhostButton onClick={() => setNewLine(null)}>{t('common.cancel')}</GhostButton>
                </div>
                {newLineError && <FieldError>{newLineError}</FieldError>}
              </div>
            ) : (
              <CatalogProductSearch
                placeholder={t('stocktake.addProduct')}
                onPick={(product) => {
                  setNewLineError(null);
                  setNewLine({ product, batchNumber: '', expiryDate: '', counted: '' });
                }}
              />
            )}
          </div>
        )}
      </GlassPanel>

      {writable && (
        <div className={cn(glassClass, 'flex flex-wrap items-center gap-3 px-4 py-3 print:hidden')}>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[0.86rem] font-semibold text-ops-ink">
              {t('stocktake.progress', { counted: summary?.counted ?? 0, total: summary?.lines ?? 0 })} ·{' '}
              {formatEuro(summary?.netValue ?? 0)}
            </p>
            <p className={cn('truncate font-sans text-[0.72rem]', posting?.ok ? 'text-ops-teal' : 'text-ops-warn')}>
              {setCounts.isPending ? t('common.saving') : posting?.ok ? t('stocktake.readyToPost') : (posting?.errors[0] ?? '')}
            </p>
          </div>
          {uncounted.length > 0 && (
            <GhostButton onClick={() => void zeroUncounted()} disabled={setCounts.isPending}>
              {t('stocktake.zeroUncounted', { count: uncounted.length })}
            </GhostButton>
          )}
          <ActionButton
            icon={ClipboardCheck}
            label={t('stocktake.post')}
            onClick={() => void runPost()}
            primary
            disabled={!posting?.ok || postDocument.isPending || submitDocument.isPending || Object.keys(drafts).length > 0}
          />
        </div>
      )}

      {writable && (
        <div className="flex justify-end print:hidden">
          <GhostButton danger onClick={() => void runCancel()}>
            {t('stocktake.cancel')}
          </GhostButton>
        </div>
      )}
    </div>
  );
};
