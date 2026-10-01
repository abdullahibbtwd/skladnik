import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthRole } from '../../lib/auth-store';
import { formatEuro } from '../../lib/dashboard-data';
import { addDocumentLine, createDocument, postDocument, submitDocument } from '../../lib/workspace-api';
import { useSitesQuery, useStockQuery, useTransferTargetsQuery } from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { useDashboard } from './dashboard-context';
import { GlassPanel, PageHeader } from './dashboard-ui';
import { availableQty, newPickedItem, pickedRows, StockItemPicker, type PickedItem } from './StockItemPicker';

export const TransferPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'SITE_MANAGER';
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const targetsQuery = useTransferTargetsQuery();
  const stockQuery = useStockQuery(siteId);

  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const targets = (targetsQuery.data?.sites ?? []).filter((site) => site.id !== siteId);
  const levels = useMemo(() => (stockQuery.data?.items ?? []).filter((item) => item.onHand > 0), [stockQuery.data]);
  const levelById = useMemo(() => new Map(levels.map((level) => [level.productId, level])), [levels]);

  const [targetSiteId, setTargetSiteId] = useState('');
  const [items, setItems] = useState<PickedItem[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefilled = useRef(false);

  useEffect(() => {
    if (!targets.some((site) => site.id === targetSiteId)) setTargetSiteId(targets.length === 1 ? targets[0].id : '');
  }, [targets.map((site) => site.id).join(), targetSiteId]);

  useEffect(() => {
    if (prefilled.current || levels.length === 0) return;
    const productId = searchParams.get('productId');
    const level = productId ? levelById.get(productId) : undefined;
    prefilled.current = true;
    if (!level) return;
    const batchId = searchParams.get('batchId') ?? undefined;
    setItems([
      newPickedItem(level, { batchId, qty: batchId ? availableQty(level, batchId) : undefined, preferUnexpired: true }),
    ]);
  }, [levels]);

  const rows = pickedRows(items, levelById, t, i18n.language);
  const total = rows.reduce((sum, row) => sum + (row.level && row.qty > 0 ? row.qty * row.unitCost : 0), 0);
  const expiredRows = rows.filter((row) => row.expired);
  const targetName = targets.find((site) => site.id === targetSiteId)?.name ?? '';
  const ready = canWrite && Boolean(siteId && targetSiteId) && rows.length > 0 && rows.every((row) => !row.problem);

  const submit = async () => {
    if (!ready || busy) return;
    setError(null);
    const ok = await confirm({
      title: t('transfer.confirmTitle', { count: rows.length, site: targetName }),
      description: [
        t('transfer.confirmBody', { from: siteName, to: targetName, total: formatEuro(total) }),
        expiredRows.length ? t('transfer.confirmExpired', { count: expiredRows.length }) : '',
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: expiredRows.length ? t('transfer.submitExpired') : t('transfer.submit'),
      danger: expiredRows.length > 0,
    });
    if (!ok) return;

    setBusy(true);
    let documentId: string | null = null;
    try {
      const created = await createDocument({
        type: 'TRANSFER',
        siteId,
        targetSiteId,
        issuedOn: new Date().toISOString().slice(0, 10),
        notes: note.trim() || undefined,
      });
      documentId = created.document.id;
      for (const row of rows) {
        await addDocumentLine(documentId, {
          productId: row.item.productId,
          quantity: row.qty,
          unitPrice: row.unitCost,
          ...(row.batch ? { batchNumber: row.batch.batchNumber, expiryDate: row.batch.expiryDate ?? undefined } : {}),
        });
      }
      await submitDocument(documentId);
      await postDocument(documentId, { confirmExpired: expiredRows.length > 0 });
      toast.success(t('transfer.done', { count: rows.length, site: targetName }));
      navigate(`/app/invoices/${documentId}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('transfer.failed');
      if (documentId) {
        toast.error(t('writeOff.savedAsDraft', { message }));
        navigate(`/app/invoices/${documentId}`, { replace: true });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', 'stock'] });
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader eyebrow={siteName || undefined} title={t('transfer.title')} description={t('transfer.desc')} />

      {!canWrite && <FieldError>{t('app.docStaffBlocked')}</FieldError>}

      <GlassPanel title={t('transfer.routeTitle')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <FieldLabel htmlFor="transfer-from">{t('transfer.from')}</FieldLabel>
            <p
              id="transfer-from"
              className="flex h-11 items-center rounded-lg border border-slate-200 bg-ops-canvas px-3 font-display text-[0.9rem] text-ops-ink"
            >
              {siteName || '—'}
            </p>
          </div>
          <ArrowRight size={18} className="hidden shrink-0 text-slate-400 sm:mb-3 sm:block" />
          <div className="sm:flex-1">
            <FieldLabel htmlFor="transfer-to">{t('transfer.to')}</FieldLabel>
            <Select
              id="transfer-to"
              value={targetSiteId}
              onChange={setTargetSiteId}
              placeholder={t('transfer.pickSite')}
              options={targets.map((site) => ({ value: site.id, label: site.name }))}
              disabled={targets.length === 0}
            />
          </div>
        </div>
        {targetsQuery.isSuccess && targets.length === 0 && (
          <p className="mt-3 font-sans text-[0.78rem] text-slate-500">{t('transfer.noOtherSites')}</p>
        )}
      </GlassPanel>

      <StockItemPicker
        title={t('transfer.itemsTitle')}
        levels={levels}
        rows={rows}
        setItems={setItems}
        loading={stockQuery.isLoading}
        disabled={!siteId}
        nothingInStock={t('transfer.nothingInStock')}
        preferUnexpired
      />

      <GlassPanel>
        <FieldLabel htmlFor="transfer-note">{t('writeOff.note')}</FieldLabel>
        <textarea
          id="transfer-note"
          value={note}
          maxLength={1000}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('transfer.notePlaceholder')}
          className="w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-2.5 font-sans text-[0.86rem] text-ops-ink outline-none focus:border-ops-teal/50 focus:bg-white"
        />
      </GlassPanel>

      {error && <FieldError>{error}</FieldError>}

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)]">
        <div className="min-w-0">
          <p className="font-display text-[0.84rem] font-medium text-ops-ink">
            {t('writeOff.summary', { count: rows.length })} · {formatEuro(total)}
          </p>
          <p className="truncate font-sans text-[0.72rem] text-slate-500">
            {targetName ? `${siteName} → ${targetName}` : t('transfer.pickSite')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || busy}
          className="shrink-0 rounded-xl bg-ops-accent px-4 py-2.5 font-display text-[0.84rem] font-medium text-white shadow-[0_6px_16px_rgba(79,70,229,0.25)] disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('transfer.submit')}
        </button>
      </div>
    </div>
  );
};
