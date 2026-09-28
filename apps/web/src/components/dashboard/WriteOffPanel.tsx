import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WRITE_OFF_REASONS, type WriteOffReason } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { addDocumentLine, createDocument, postDocument, submitDocument, uploadDocumentCapture } from '../../lib/workspace-api';
import { useSitesQuery, useStockQuery } from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { confirm } from '../ui/Dialog';
import { toast } from '../ui/Toaster';
import { CameraCapture } from './CameraCapture';
import { useDashboard } from './dashboard-context';
import { GlassPanel, PageHeader } from './dashboard-ui';
import { availableQty, newPickedItem, pickedRows, StockItemPicker, type PickedItem } from './StockItemPicker';

function isReason(value: string | null): value is WriteOffReason {
  return WRITE_OFF_REASONS.some((reason) => reason === value);
}

export const WriteOffPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT' || role === 'SITE_MANAGER';
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const stockQuery = useStockQuery(siteId);

  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const levels = useMemo(() => (stockQuery.data?.items ?? []).filter((item) => item.onHand > 0), [stockQuery.data]);
  const levelById = useMemo(() => new Map(levels.map((level) => [level.productId, level])), [levels]);

  const requestedReason = searchParams.get('reason');
  const [reason, setReason] = useState<WriteOffReason | null>(isReason(requestedReason) ? requestedReason : null);
  const [items, setItems] = useState<PickedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefilled = useRef(false);

  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);

  useEffect(() => {
    if (prefilled.current || levels.length === 0) return;
    const productId = searchParams.get('productId');
    const level = productId ? levelById.get(productId) : undefined;
    prefilled.current = true;
    if (!level) return;
    const batchId = searchParams.get('batchId') ?? undefined;
    setItems([newPickedItem(level, { batchId, qty: batchId ? availableQty(level, batchId) : undefined })]);
  }, [levels]);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const rows = pickedRows(items, levelById, t, qtyFormat);
  const total = rows.reduce((sum, row) => sum + (row.level && row.qty > 0 ? row.qty * row.unitCost : 0), 0);
  const ready = canWrite && Boolean(siteId) && reason !== null && rows.length > 0 && rows.every((row) => !row.problem);

  const submit = async () => {
    if (!ready || !reason || busy) return;
    setError(null);
    const ok = await confirm({
      title: t('writeOff.confirmTitle', { count: rows.length }),
      description: t('writeOff.confirmBody', {
        reason: t(`labels.writeOffReason.${reason}`),
        site: siteName,
        total: formatEuro(total),
      }),
      confirmLabel: t('writeOff.submit'),
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    let documentId: string | null = null;
    try {
      const created = await createDocument({
        type: 'PROTOCOL',
        siteId,
        direction: 'OUT',
        documentNumber: `WO-${Date.now()}`,
        issuedOn: new Date().toISOString().slice(0, 10),
        writeOffReason: reason,
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
      for (const photo of photos) await uploadDocumentCapture(documentId, photo.file);
      await submitDocument(documentId);
      await postDocument(documentId);
      toast.success(t('writeOff.done', { count: rows.length }));
      navigate(`/app/invoices/${documentId}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('writeOff.failed');
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
    <div className="flex flex-col gap-4 pb-28 sm:gap-5 lg:pb-0">
      <PageHeader eyebrow={siteName || undefined} title={t('pages.writeOffTitle')} description={t('pages.writeOffDesc')} />

      {!canWrite && <FieldError>{t('app.docStaffBlocked')}</FieldError>}

      <GlassPanel title={t('writeOff.reasonTitle')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {WRITE_OFF_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              aria-pressed={reason === option}
              className={cn(
                'rounded-xl border px-3 py-3 text-left font-display text-[0.86rem] font-medium transition-all active:scale-[0.98]',
                reason === option
                  ? 'border-ops-danger/30 bg-rose-50 text-ops-danger'
                  : 'border-slate-200 bg-white text-ops-ink hover:border-slate-300',
              )}
            >
              {t(`labels.writeOffReason.${option}`)}
            </button>
          ))}
        </div>
      </GlassPanel>

      <StockItemPicker
        title={t('writeOff.itemsTitle')}
        levels={levels}
        rows={rows}
        setItems={setItems}
        loading={stockQuery.isLoading}
        disabled={!siteId}
        nothingInStock={t('writeOff.nothingInStock')}
        onSearchingChange={setSearching}
      />

      <GlassPanel title={t('writeOff.evidenceTitle')}>
        <p className="mb-3 font-sans text-[0.78rem] text-slate-500">{t('writeOff.evidenceHint')}</p>
        <div className="flex flex-wrap gap-2.5">
          {photos.map((photo, index) => (
            <div key={photo.url} className="relative size-20 overflow-hidden rounded-xl border border-slate-200">
              {photo.file.type.startsWith('image/') ? (
                <img src={photo.url} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center bg-ops-canvas font-mono text-[0.66rem] text-slate-500">PDF</span>
              )}
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  setPhotos((current) => current.filter((_, i) => i !== index));
                }}
                className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label={t('writeOff.removePhoto')}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-ops-canvas font-display text-[0.7rem] text-slate-500 hover:border-ops-teal/50 hover:text-ops-teal"
          >
            <Camera size={18} />
            {t('writeOff.addPhoto')}
          </button>
        </div>
        <div className="mt-4">
          <FieldLabel htmlFor="write-off-note">{t('writeOff.note')}</FieldLabel>
          <textarea
            id="write-off-note"
            value={note}
            maxLength={1000}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('writeOff.notePlaceholder')}
            className="w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-2.5 font-sans text-[0.86rem] text-ops-ink outline-none focus:border-ops-teal/50 focus:bg-white"
          />
        </div>
      </GlassPanel>

      {error && <FieldError>{error}</FieldError>}

      <div
        className={cn(
          'bottom-24 z-20 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)] backdrop-blur lg:bottom-4',
          searching ? 'static' : 'sticky',
        )}
      >
        <div className="min-w-0">
          <p className="font-display text-[0.84rem] font-medium text-ops-ink">
            {t('writeOff.summary', { count: rows.length })} · {formatEuro(total)}
          </p>
          <p className="truncate font-sans text-[0.72rem] text-slate-500">
            {reason ? t(`labels.writeOffReason.${reason}`) : t('writeOff.pickReason')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || busy}
          className="shrink-0 rounded-xl bg-ops-danger px-4 py-2.5 font-display text-[0.84rem] font-medium text-white shadow-[0_6px_16px_rgba(225,29,72,0.25)] disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('writeOff.submit')}
        </button>
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => setPhotos((current) => [...current, { file, url: URL.createObjectURL(file) }])}
      />
    </div>
  );
};
