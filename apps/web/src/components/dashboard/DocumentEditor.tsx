import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, CheckCircle2, LifeBuoy, Loader2, Plus, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import {
  DOCUMENT_TYPES,
  defaultStockDirection,
  type DocumentType,
} from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { formatEuro } from '../../lib/dashboard-data';
import {
  captureFileUrl,
  workspaceKeys,
  type DocumentCaptureRecord,
  type ProductRecord,
} from '../../lib/workspace-api';
import {
  useAddDocumentLine,
  useCancelDocument,
  useCreateDocument,
  useDeleteDocumentLine,
  useDocumentQuery,
  usePartnersQuery,
  usePostDocument,
  useProductsQuery,
  useRetryDocumentExtraction,
  useSitesQuery,
  useSubmitDocument,
  useUpdateDocument,
  useUploadDocumentCapture,
} from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { ocrFailureCopy } from '../../lib/ocr-failure';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { useTranslation } from 'react-i18next';
import { useDashboard } from './dashboard-context';
import { CameraCapture } from './CameraCapture';
import {
  ActionButton,
  GhostButton,
  GlassPanel,
  LiveBadge,
  PageHeader,
  StatusPill,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';
import { cn } from '../../lib/cn';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-[0.65rem] font-sans text-[0.88rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

const compactFieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-sans text-[0.8rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const DocumentCreatePanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT' || role === 'SITE_MANAGER';
  const { siteId: dashboardSiteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const partnersQuery = usePartnersQuery();
  const createDocument = useCreateDocument();
  const sites = (sitesQuery.data?.sites ?? []).filter((site) => site.isActive);
  const partners = partnersQuery.data?.partners ?? [];

  const [type, setType] = useState<DocumentType>('INVOICE');
  const [siteId, setSiteId] = useState(dashboardSiteId);
  const [partnerId, setPartnerId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId && dashboardSiteId) setSiteId(dashboardSiteId);
  }, [dashboardSiteId, siteId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!canWrite) {
      setError(t('doc.staffCannotCreate'));
      return;
    }
    try {
      const result = await createDocument.mutateAsync({
        type,
        siteId,
        partnerId: partnerId || undefined,
        documentNumber: documentNumber.trim(),
        issuedOn,
        direction: defaultStockDirection(type),
      });
      toast.success(t('doc.draftCreated'));
      navigate(`/app/invoices/${result.document.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('doc.createFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title={t('pages.newDocTitle')}
        description={t('pages.newDocDesc')}
        action={<GhostButton onClick={() => navigate('/app/invoices')}>{t('pages.backToList')}</GhostButton>}
      />

      <GlassPanel title={t('doc.documentHeader')}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <FieldLabel htmlFor="doc-type">{t('doc.type')}</FieldLabel>
            <Select
              id="doc-type"
              value={type}
              onChange={setType}
              options={DOCUMENT_TYPES.map((item) => ({ value: item, label: t(`labels.documentType.${item}`) }))}
            />
            <p className="mt-1.5 font-sans text-[0.72rem] text-slate-400">
              {t('doc.stock')} {defaultStockDirection(type) === 'IN' ? t('labels.stockIn') : t('labels.stockOut')}
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="doc-site">{t('doc.site')}</FieldLabel>
            <Select
              id="doc-site"
              value={siteId}
              onChange={setSiteId}
              options={sites.map((site) => ({ value: site.id, label: site.name }))}
              placeholder={t('doc.selectSite')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="doc-partner">{t('doc.partner')}</FieldLabel>
            <Select
              id="doc-partner"
              value={partnerId}
              onChange={setPartnerId}
              options={[
                { value: '', label: t('labels.noPartner') },
                ...partners.map((partner) => ({ value: partner.id, label: partner.name })),
              ]}
            />
          </div>
          <div>
            <FieldLabel htmlFor="doc-number">{t('doc.documentNumber')}</FieldLabel>
            <input
              id="doc-number"
              required
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder={t('doc.printedNumber')}
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="doc-date">{t('doc.issuedOn')}</FieldLabel>
            <input
              id="doc-date"
              type="date"
              required
              value={issuedOn}
              onChange={(event) => setIssuedOn(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              disabled={createDocument.isPending || !canWrite || !siteId}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ops-teal px-4 py-2.5 font-display text-[0.82rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover disabled:opacity-50"
            >
              {t('doc.createDraft')}
            </button>
          </div>
          {error && (
            <div className="sm:col-span-2">
              <FieldError>{error}</FieldError>
            </div>
          )}
        </form>
      </GlassPanel>
    </div>
  );
};

export const DocumentDetailPanel: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT' || role === 'SITE_MANAGER';
  const detailQuery = useDocumentQuery(id);
  const document = detailQuery.data?.document;
  const posting = detailQuery.data?.posting;
  const writable = document?.status === 'DRAFT' || document?.status === 'REVIEW';
  const updateDocument = useUpdateDocument(id ?? '');
  const addLine = useAddDocumentLine(id ?? '');
  const deleteLine = useDeleteDocumentLine(id ?? '');
  const submitDocument = useSubmitDocument(id ?? '');
  const postDocument = usePostDocument(id ?? '');
  const cancelDocument = useCancelDocument(id ?? '');
  const uploadCapture = useUploadDocumentCapture(id ?? '');
  const retryExtraction = useRetryDocumentExtraction(id ?? '');
  const queryClient = useQueryClient();
  const captureStatusRef = useRef<Record<string, string>>({});
  const openedCameraRef = useRef(false);
  const sitesQuery = useSitesQuery();
  const partnersQuery = usePartnersQuery();
  const sites = (sitesQuery.data?.sites ?? []).filter((site) => site.isActive);
  const partners = partnersQuery.data?.partners ?? [];
  const [cameraOpen, setCameraOpen] = useState(false);

  const [headerError, setHeaderError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [manualAdd, setManualAdd] = useState(false);
  const [header, setHeader] = useState({
    type: 'INVOICE' as DocumentType,
    siteId: '',
    partnerId: '',
    documentNumber: '',
    issuedOn: todayIso(),
  });

  useEffect(() => {
    if (!document) return;
    setHeader({
      type: document.type,
      siteId: document.site.id,
      partnerId: document.partner?.id ?? '',
      documentNumber: document.documentNumber,
      issuedOn: document.issuedOn,
    });
  }, [document]);

  useEffect(() => {
    if (!document) return;
    for (const capture of document.captures) {
      const previous = captureStatusRef.current[capture.id];
      if (previous && previous !== capture.extractionStatus) {
        if (capture.extractionStatus === 'SUCCEEDED') {
          toast.success(t('doc.invoiceRead'), t('doc.invoiceReadHint', { confidence: capture.confidence ?? 'medium' }));
          queryClient.invalidateQueries({ queryKey: ['workspace', 'products'] });
          queryClient.invalidateQueries({ queryKey: workspaceKeys.partners });
        }
        if (capture.extractionStatus === 'FAILED') {
          const copy = ocrFailureCopy(capture.extractionError);
          toast.error(copy.title, copy.action);
        }
      }
    }
    captureStatusRef.current = Object.fromEntries(document.captures.map((row) => [row.id, row.extractionStatus]));
  }, [document, queryClient]);

  useEffect(() => {
    openedCameraRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!document || openedCameraRef.current) return;
    if (searchParams.get('camera') !== '1') return;
    if (!writable || !canWrite) return;
    openedCameraRef.current = true;
    setCameraOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('camera');
    setSearchParams(next, { replace: true });
  }, [canWrite, document, searchParams, setSearchParams, writable]);

  const saveHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !writable) return;
    setHeaderError(null);
    try {
      await updateDocument.mutateAsync({
        type: header.type,
        siteId: header.siteId,
        partnerId: header.partnerId || null,
        documentNumber: header.documentNumber.trim(),
        issuedOn: header.issuedOn,
        direction: defaultStockDirection(header.type),
      });
      toast.success(t('doc.headerSaved'));
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : t('doc.saveHeaderFailed'));
    }
  };

  const runSubmit = async () => {
    if (!id) return;
    try {
      await submitDocument.mutateAsync();
      toast.success(t('doc.submitted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.submitFailed'));
    }
  };

  const runPost = async () => {
    if (!id) return;
    const ok = await confirm({
      title: t('doc.postTitle'),
      description: t('doc.postBody'),
      confirmLabel: t('doc.postConfirm'),
    });
    if (!ok) return;
    try {
      await postDocument.mutateAsync();
      toast.success(t('doc.postedToStock'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.postFailed'));
    }
  };

  const runCancel = async () => {
    if (!id) return;
    const ok = await confirm({
      title: t('doc.cancelTitle'),
      description: t('doc.cancelBody'),
      confirmLabel: t('doc.cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelDocument.mutateAsync();
      toast.success(t('doc.cancelled'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.cancelFailed'));
    }
  };

  if (detailQuery.isPending) {
    return <p className="py-16 text-center font-sans text-sm text-slate-400">{t('doc.loading')}</p>;
  }
  if (!document) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-sm text-ops-danger">{t('doc.notFound')}</p>
        <button type="button" className="mt-3 font-display text-[0.8rem] text-ops-accent" onClick={() => navigate('/app/invoices')}>
          {t('pages.backToList')}
        </button>
      </div>
    );
  }

  const lineTotal = document.lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const reading = Boolean(document.extraction?.reading);
  const failedCapture = document.captures.find((capture) => capture.extractionFailed);
  const ocrError = !reading && failedCapture ? ocrFailureCopy(failedCapture.extractionError) : null;
  const hasLines = document.lines.length > 0;
  const showLineTable = hasLines || manualAdd;

  const attachPhoto = async (file: File) => {
    try {
      await uploadCapture.mutateAsync(file);
      toast.success(t('doc.photoAttached'), t('doc.reading'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.uploadFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={t(`labels.documentType.${document.type}`)}
        title={document.documentNumber}
        description={`${document.partner?.name ?? t('labels.noPartner')} · ${document.site.name} · ${document.direction === 'IN' ? t('labels.stockIn') : t('labels.stockOut')}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={document.status} />
            <GhostButton onClick={() => navigate('/app/invoices')}>
              <span className="inline-flex items-center gap-1">
                <ArrowLeft size={13} /> {t('doc.list')}
              </span>
            </GhostButton>
          </div>
        }
      />

      {document.extraction?.confidence === 'low' && !reading && hasLines && (
        <div className="rounded-xl border border-ops-warn/25 bg-orange-50 px-4 py-3">
          <p className="font-display text-[0.78rem] font-medium text-ops-warn">{t('doc.lowConfidence')}</p>
          <p className="mt-1 font-sans text-[0.76rem] text-ops-warn">
            {t('doc.lowConfidenceHint')}
          </p>
        </div>
      )}

      {posting && posting.errors.length > 0 && writable && hasLines && (
        <div className="rounded-xl border border-ops-warn/25 bg-orange-50 px-4 py-3">
          <p className="font-display text-[0.78rem] font-medium text-ops-warn">{t('doc.cannotPost')}</p>
          <ul className="mt-1.5 list-disc pl-4 font-sans text-[0.76rem] text-ops-warn">
            {posting.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {canWrite && writable && (
        <div className="flex flex-wrap gap-2">
          {document.status === 'DRAFT' && (
            <ActionButton
              icon={CheckCircle2}
              label={t('doc.submitReview')}
              onClick={runSubmit}
              disabled={submitDocument.isPending || !posting?.ok}
            />
          )}
          {document.status === 'REVIEW' && (
            <ActionButton
              icon={CheckCircle2}
              label={t('doc.post')}
              onClick={runPost}
              primary
              disabled={postDocument.isPending || !posting?.ok}
            />
          )}
          <GhostButton danger onClick={runCancel}>
            {t('doc.cancelDocument')}
          </GhostButton>
        </div>
      )}

      <GlassPanel title={t('doc.header')}>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={saveHeader}>
          <div>
            <FieldLabel htmlFor="hdr-type">{t('doc.type')}</FieldLabel>
            <Select
              id="hdr-type"
              value={header.type}
              onChange={(value) => setHeader((prev) => ({ ...prev, type: value }))}
              options={DOCUMENT_TYPES.map((item) => ({ value: item, label: t(`labels.documentType.${item}`) }))}
              disabled={!writable || !canWrite}
            />
          </div>
          <div>
            <FieldLabel htmlFor="hdr-site">{t('doc.site')}</FieldLabel>
            <Select
              id="hdr-site"
              value={header.siteId}
              onChange={(value) => setHeader((prev) => ({ ...prev, siteId: value }))}
              options={sites.map((site) => ({ value: site.id, label: site.name }))}
              disabled={!writable || !canWrite}
            />
          </div>
          <div>
            <FieldLabel htmlFor="hdr-partner">{t('doc.partner')}</FieldLabel>
            <Select
              id="hdr-partner"
              value={header.partnerId}
              onChange={(value) => setHeader((prev) => ({ ...prev, partnerId: value }))}
              options={[
                { value: '', label: t('labels.noPartner') },
                ...partners.map((partner) => ({ value: partner.id, label: partner.name })),
              ]}
              disabled={!writable || !canWrite}
            />
          </div>
          <div>
            <FieldLabel htmlFor="hdr-number">{t('doc.documentNumber')}</FieldLabel>
            <input
              id="hdr-number"
              value={header.documentNumber}
              onChange={(event) => setHeader((prev) => ({ ...prev, documentNumber: event.target.value }))}
              disabled={!writable || !canWrite}
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="hdr-date">{t('doc.issuedOn')}</FieldLabel>
            <input
              id="hdr-date"
              type="date"
              value={header.issuedOn}
              onChange={(event) => setHeader((prev) => ({ ...prev, issuedOn: event.target.value }))}
              disabled={!writable || !canWrite}
              className={fieldClass}
            />
          </div>
          {writable && canWrite && (
            <div className="flex items-end">
              <button
                type="submit"
                disabled={updateDocument.isPending}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-display text-[0.82rem] font-medium text-ops-ink shadow-sm hover:border-ops-accent/30 disabled:opacity-50"
              >
                {t('doc.saveHeader')}
              </button>
            </div>
          )}
          {headerError && (
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldError>{headerError}</FieldError>
            </div>
          )}
        </form>
      </GlassPanel>

      {(writable && canWrite) || document.captures.length > 0 ? (
        <GlassPanel
          title={document.captures.length > 0 || !writable || !canWrite ? t('doc.invoicePhotos') : undefined}
          action={document.captures.length > 0 ? <LiveBadge>{t('doc.pages', { count: document.captures.length })}</LiveBadge> : undefined}
        >
          {ocrError && (
            <div className="mb-4 rounded-xl border border-ops-danger/25 bg-rose-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ops-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[0.82rem] font-semibold text-ops-danger">{ocrError.title}</p>
                  <p className="mt-1 font-sans text-[0.78rem] text-rose-800">{ocrError.what}</p>
                  <p className="mt-1 font-sans text-[0.76rem] text-rose-700">{ocrError.action}</p>
                  {ocrError.contactSupport && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ops-danger/20 bg-white px-2.5 py-1.5 font-display text-[0.74rem] font-medium text-ops-danger">
                      <LifeBuoy size={13} />
                      {t('doc.contactSupport')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {writable && canWrite && document.captures.length === 0 ? (
            <div className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ops-teal/35 bg-teal-50/60 px-4 py-8 text-center">
              <button
                type="button"
                disabled={uploadCapture.isPending}
                onClick={() => setCameraOpen(true)}
                className="flex flex-col items-center gap-2 disabled:opacity-60"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-ops-teal text-white shadow-[0_8px_18px_rgba(13,148,136,0.28)]">
                  {uploadCapture.isPending ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
                </span>
                <span className="font-display text-[1.05rem] font-semibold text-ops-ink">
                  {uploadCapture.isPending ? t('doc.uploading') : t('doc.addPicture')}
                </span>
              </button>
              <span className="max-w-sm font-sans text-[0.78rem] text-slate-500">{t('doc.photographHint')}</span>
            </div>
          ) : document.captures.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {document.captures.map((capture) => (
                <CaptureThumb
                  key={capture.id}
                  documentId={document.id}
                  capture={capture}
                  canRetry={writable && canWrite && (ocrError?.retryable ?? true)}
                  retrying={retryExtraction.isPending}
                  onRetry={async () => {
                    try {
                      await retryExtraction.mutateAsync(capture.id);
                      toast.info(t('doc.readingAgain'));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t('doc.retryFailed'));
                    }
                  }}
                />
              ))}
              {writable && canWrite && (
                <button
                  type="button"
                  disabled={uploadCapture.isPending}
                  onClick={() => setCameraOpen(true)}
                  className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-ops-canvas text-slate-500 transition-colors hover:border-ops-teal/50 hover:text-ops-teal disabled:opacity-60"
                >
                  {uploadCapture.isPending ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  <span className="font-display text-[0.68rem] font-medium">
                    {uploadCapture.isPending ? t('doc.uploading') : t('doc.addPage')}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <p className="font-sans text-[0.78rem] text-slate-400">{t('doc.noPhotos')}</p>
          )}
        </GlassPanel>
      ) : null}

      <GlassPanel
        padded={false}
        title={t('doc.lines')}
        action={hasLines ? <LiveBadge>{formatEuro(lineTotal)}</LiveBadge> : undefined}
      >
        {reading && !showLineTable && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 sm:px-5">
            <Loader2 size={28} className="animate-spin text-ops-accent" />
            <p className="font-display text-[0.95rem] font-medium text-ops-ink">{t('doc.reading')}</p>
            <p className="max-w-sm text-center font-sans text-[0.78rem] text-slate-500">
            {t('doc.readingHint')}
            </p>
          </div>
        )}

        {reading && showLineTable && (
          <div className="flex items-center gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3 sm:px-5">
            <Loader2 size={18} className="animate-spin text-ops-accent" />
            <div>
              <p className="font-display text-[0.8rem] font-medium text-ops-accent">{t('doc.reading')}</p>
              <p className="font-sans text-[0.72rem] text-slate-500">{t('doc.readingNewLines')}</p>
            </div>
          </div>
        )}

        {showLineTable ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('doc.product')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('doc.qty')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('doc.price')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('doc.batchExpiry')}</th>
                    <th className="px-3 py-2.5 text-right font-display font-medium">{t('doc.total')}</th>
                    <th className="px-4 py-2.5 sm:px-5" />
                  </tr>
                </thead>
                <tbody>
                  {document.lines.map((line) => (
                    <tr key={line.id} className={tableRowClass()}>
                      <td className="px-4 py-3 sm:px-5">
                        <p className="font-display text-[0.82rem] font-medium text-ops-ink">{line.product?.name ?? t('doc.unmatched')}</p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {line.product?.code ?? '—'} · {line.unit ? t(`labels.unit.${line.unit}`) : ''}
                          {line.product?.status === 'PENDING_REVIEW' ? ` · ${t('doc.pendingReview')}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.78rem] text-slate-600">{line.quantity}</td>
                      <td className="px-3 py-3 font-mono text-[0.78rem] text-slate-600">
                        {formatEuro(line.finalUnitPrice ?? line.unitPrice)}
                        {line.discountPercent > 0 && (
                          <span className="ml-1 text-slate-400">−{line.discountPercent}%</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.72rem] text-slate-500">
                        {line.product?.batchTracking ? `${line.batchNumber ?? '—'} · ${line.expiryDate ?? '—'}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[0.78rem] text-ops-ink">
                        {line.lineTotal === null ? '—' : formatEuro(line.lineTotal)}
                      </td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        {writable && canWrite && (
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-ops-danger"
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('doc.removeLineTitle'),
                                confirmLabel: t('doc.removeConfirm'),
                                danger: true,
                              });
                              if (!ok) return;
                              try {
                                await deleteLine.mutateAsync(line.id);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : t('doc.removeLineFailed'));
                              }
                            }}
                            aria-label={t('doc.removeLine')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {writable && canWrite && id && manualAdd && (
                    <AddLineRow
                      onSubmit={async (input) => {
                        setLineError(null);
                        try {
                          await addLine.mutateAsync(input);
                        } catch (err) {
                          setLineError(err instanceof Error ? err.message : t('doc.addLineFailed'));
                          throw err;
                        }
                      }}
                      pending={addLine.isPending}
                    />
                  )}
                </tbody>
              </table>
            </div>
            {lineError && (
              <div className="px-4 py-3 sm:px-5">
                <FieldError>{lineError}</FieldError>
              </div>
            )}
          </>
        ) : (
          !reading && (
            <div className="px-4 py-8 text-center sm:px-5">
              {ocrError ? (
                <>
                  <p className="font-display text-[0.88rem] font-medium text-ops-ink">{t('doc.linesNotFilled')}</p>
                  <p className="mx-auto mt-1 max-w-md font-sans text-[0.78rem] text-slate-500">
                    {t('doc.linesNotFilledHint')}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-[0.88rem] font-medium text-ops-ink">{t('doc.waitingPhoto')}</p>
                  <p className="mx-auto mt-1 max-w-md font-sans text-[0.78rem] text-slate-500">
                    {t('doc.waitingPhotoHint')}
                  </p>
                </>
              )}
            </div>
          )
        )}

        {writable && canWrite && !manualAdd && (
          <div className="border-t border-slate-100 px-4 py-3 text-center sm:px-5">
            <button
              type="button"
              onClick={() => setManualAdd(true)}
              className="font-display text-[0.76rem] font-medium text-ops-accent hover:underline"
            >
              {t('doc.addManually')}
            </button>
          </div>
        )}
      </GlassPanel>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={attachPhoto}
      />
    </div>
  );
};

function AddLineRow({
  onSubmit,
  pending,
}: {
  onSubmit: (input: {
    productId: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    vatRate?: number;
    batchNumber?: string;
    expiryDate?: string;
  }) => Promise<void>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const reset = () => {
    setProduct(null);
    setQuantity('1');
    setUnitPrice('');
    setDiscountPercent('0');
    setBatchNumber('');
    setExpiryDate('');
  };

  return (
    <tr className="border-t border-slate-100 bg-ops-canvas/50">
      <td className="px-4 py-3 sm:px-5">
        <ProductPicker
          value={product}
          onChange={(next) => {
            setProduct(next);
            if (next) {
              setUnitPrice(String(next.purchasePrice));
              if (!next.batchTracking) {
                setBatchNumber('');
                setExpiryDate('');
              }
            }
          }}
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className={compactFieldClass}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex gap-1.5">
          <input
            type="number"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            placeholder={t('doc.price')}
            className={compactFieldClass}
          />
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
            title={t('doc.discount')}
            className={cn(compactFieldClass, 'w-16')}
          />
        </div>
      </td>
      <td className="px-3 py-3">
        {product?.batchTracking ? (
          <div className="flex gap-1.5">
            <input
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
              placeholder={t('doc.batch')}
              className={compactFieldClass}
            />
            <input
              type="date"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              className={compactFieldClass}
            />
          </div>
        ) : (
          <span className="font-sans text-[0.72rem] text-slate-400">{t('doc.notBatchTracked')}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            if (!product) {
              toast.error(t('doc.pickProduct'));
              return;
            }
            await onSubmit({
              productId: product.id,
              quantity: Number(quantity),
              unitPrice: Number(unitPrice),
              discountPercent: Number(discountPercent) || 0,
              vatRate: product.vatRate,
              batchNumber: product.batchTracking ? batchNumber.trim() : undefined,
              expiryDate: product.batchTracking ? expiryDate : undefined,
            });
            reset();
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-ops-teal px-2.5 py-1.5 font-display text-[0.72rem] font-medium text-white disabled:opacity-50"
        >
          <Plus size={12} />
          {t('doc.addLine')}
        </button>
      </td>
      <td />
    </tr>
  );
}

function ProductPicker({
  value,
  onChange,
}: {
  value: ProductRecord | null;
  onChange: (product: ProductRecord | null) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const productsQuery = useProductsQuery({ q: debounced || undefined, status: 'ACTIVE' });
  const products = productsQuery.data?.products ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="relative">
      <input
        value={value ? `${value.name} (${value.code})` : search}
        onChange={(event) => {
          onChange(null);
          setSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('doc.searchProducts')}
        className={compactFieldClass}
      />
      {open && !value && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-20 max-h-52 w-[min(22rem,70vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {products.length === 0 ? (
            <p className="px-3 py-2 font-sans text-[0.74rem] text-slate-400">{t('doc.noMatchingProducts')}</p>
          ) : (
            products.slice(0, 12).map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onChange(product);
                  setSearch('');
                  setOpen(false);
                }}
                className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-ops-canvas"
              >
                <span className="font-display text-[0.78rem] font-medium text-ops-ink">{product.name}</span>
                <span className="font-mono text-[0.64rem] text-slate-400">
                  {product.code}
                  {product.batchTracking ? ` · ${t('doc.batchShort')}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CaptureThumb({
  documentId,
  capture,
  canRetry,
  retrying,
  onRetry,
}: {
  documentId: string;
  capture: DocumentCaptureRecord;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const fileUrl = captureFileUrl(documentId, capture.id);
  const reading = capture.extractionStatus === 'QUEUED' || capture.extractionStatus === 'RUNNING';

  return (
    <div className="flex w-28 flex-col gap-1">
      <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-ops-canvas">
        <a href={fileUrl} target="_blank" rel="noreferrer" className="block size-full">
          <img src={fileUrl} alt={t('doc.pageAlt', { n: capture.pageNumber })} className="size-full object-cover" />
        </a>
        {reading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/75 font-display text-[0.66rem] font-medium text-ops-accent">
            <Loader2 size={16} className="animate-spin" />
            {t('doc.readingThumb')}
          </div>
        )}
        {capture.extractionFailed && (
          <div className="absolute inset-x-0 bottom-0 bg-ops-danger/90 px-1 py-0.5 text-center font-display text-[0.6rem] text-white">
            {t('doc.failed')}
          </div>
        )}
        {capture.extractionStatus === 'SUCCEEDED' && capture.confidence && (
          <div className="absolute top-1 right-1 rounded-full bg-white/90 px-1.5 py-0.5 font-display text-[0.58rem] font-medium text-slate-600">
            {capture.confidence}
          </div>
        )}
      </div>
      {canRetry && capture.extractionFailed && (
        <button
          type="button"
          disabled={retrying}
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 font-display text-[0.62rem] text-slate-600 hover:text-ops-accent disabled:opacity-50"
        >
          <RotateCw size={10} />
          {t('doc.retry')}
        </button>
      )}
    </div>
  );
}
