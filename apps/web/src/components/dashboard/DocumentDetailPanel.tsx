import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, CheckCircle2, LifeBuoy, Loader2, Printer, RotateCw, TriangleAlert } from 'lucide-react';
import {
  PAPER_DOCUMENT_TYPES,
  WRITE_OFF_REASONS,
  defaultStockDirection,
  isStockOperationType,
  type DocumentType,
  type WriteOffReason,
} from '@skladnik/shared';
import { useTranslation } from 'react-i18next';
import { useAuthRole, useRequiredUser } from '../../lib/auth-store';
import { cn } from '../../lib/cn';
import { useConnectivity } from '../../lib/connectivity';
import { formatEuro } from '../../lib/dashboard-data';
import { ocrFailureCopy } from '../../lib/ocr-failure';
import { usePermissions } from '../../lib/permissions';
import { ApiError, workspaceKeys, type DuplicateDocumentRef, type PrintedTotalsInput } from '../../lib/workspace-api';
import {
  useAddDocumentLine,
  useCancelDocument,
  useConfirmPendingProduct,
  useCreateProductFromLine,
  useDeleteDocumentLine,
  useDocumentQuery,
  usePartnerLookupQuery,
  usePostDocument,
  useRetryDocumentExtraction,
  useSitesQuery,
  useSubmitDocument,
  useTransferTargetsQuery,
  useUpdateDocument,
  useUpdateDocumentLine,
  useUploadDocumentCapture,
} from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { DateField } from '../ui/DateField';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { CameraCapture } from './CameraCapture';
import { ActionButton, GhostButton, GlassPanel, LiveBadge, PageHeader, StatusPill, glassClass } from './dashboard-ui';
import { DocumentLines, LineForm, lineIssues } from './DocumentLines';
import { DocumentPhotoViewer } from './DocumentPhotoViewer';
import { DocumentPrintView } from './DocumentPrintView';
import { ReversalNotice, ReversePanel } from './DocumentReversal';
import { DocumentTotalsPanel } from './DocumentTotalsPanel';
import { DateSanityHint, DuplicateNotice } from './document-checks-ui';
import { InlineCreateSupplier } from './InlineCreateSupplier';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-[0.65rem] font-sans text-[0.88rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Past this, the reading panel says it is taking longer than usual (the page keeps checking). */
const READING_SLOW_MS = 45_000;
/** Past this while still "reading", offer retry — the job may be stuck or the server unreachable. */
const READING_TIMEOUT_MS = 180_000;

function useReadingWait(reading: boolean) {
  const [slow, setSlow] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setSlow(false);
    setTimedOut(false);
    if (!reading) return;
    const slowTimer = window.setTimeout(() => setSlow(true), READING_SLOW_MS);
    const giveUpTimer = window.setTimeout(() => setTimedOut(true), READING_TIMEOUT_MS);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(giveUpTimer);
    };
  }, [reading]);
  return { slow, timedOut };
}

export const DocumentDetailPanel: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthRole();
  const user = useRequiredUser();
  const { seeFinancials } = usePermissions();
  const isManager = role === 'OWNER' || role === 'ACCOUNTANT' || role === 'SITE_MANAGER';
  const detailQuery = useDocumentQuery(id);
  const reachable = useConnectivity((state) => state.reachable);
  const document = detailQuery.data?.document;
  const posting = detailQuery.data?.posting;
  const writable = document?.status === 'DRAFT' || document?.status === 'REVIEW';
  /** Staff may edit only their own drafts until submitted (CASHIER F-01). */
  const ownStaffDraft =
    role === 'STAFF' && document?.status === 'DRAFT' && document.createdBy?.id === user.id;
  const canWrite = isManager || ownStaffDraft;
  /** Staff posts write-offs only; paper receipts stay for manager review. */
  const canPost =
    isManager ||
    (role === 'STAFF' &&
      document?.type === 'WRITE_OFF' &&
      document.createdBy?.id === user.id &&
      (document.status === 'DRAFT' || document.status === 'REVIEW'));
  const canCancel = isManager;
  const canReverse = isManager;
  const updateDocument = useUpdateDocument(id ?? '');
  const addLine = useAddDocumentLine(id ?? '');
  const updateLine = useUpdateDocumentLine(id ?? '');
  const deleteLine = useDeleteDocumentLine(id ?? '');
  const createProduct = useCreateProductFromLine(id ?? '');
  const confirmProduct = useConfirmPendingProduct(id ?? '');
  const submitDocument = useSubmitDocument(id ?? '');
  const postDocument = usePostDocument(id ?? '');
  const cancelDocument = useCancelDocument(id ?? '');
  const uploadCapture = useUploadDocumentCapture(id ?? '');
  const retryExtraction = useRetryDocumentExtraction(id ?? '');
  const queryClient = useQueryClient();
  const captureStatusRef = useRef<Record<string, string>>({});
  const sitesQuery = useSitesQuery();
  const partnersQuery = usePartnerLookupQuery();
  const targetsQuery = useTransferTargetsQuery();
  const sites = (sitesQuery.data?.sites ?? []).filter((site) => site.isActive);
  const partners = partnersQuery.data?.partners ?? [];
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);

  const [headerError, setHeaderError] = useState<string | null>(null);
  const [headerDuplicate, setHeaderDuplicate] = useState<DuplicateDocumentRef | null>(null);
  const [manualAdd, setManualAdd] = useState(false);
  const [header, setHeader] = useState({
    type: 'INVOICE' as DocumentType,
    siteId: '',
    targetSiteId: '',
    partnerId: '',
    documentNumber: '',
    issuedOn: todayIso(),
    writeOffReason: '' as WriteOffReason | '',
  });

  useEffect(() => {
    if (document?.type === 'STOCKTAKE') navigate(`/app/stocktake/${document.id}`, { replace: true });
    if (document?.type === 'SALE') navigate(`/app/sales/${document.id}`, { replace: true });
  }, [document?.type, document?.id, navigate]);

  useEffect(() => {
    if (!document) return;
    setHeader({
      type: document.type,
      siteId: document.site.id,
      targetSiteId: document.targetSite?.id ?? '',
      partnerId: document.partner?.id ?? '',
      documentNumber: document.documentNumber,
      issuedOn: document.issuedOn,
      writeOffReason: document.writeOffReason ?? '',
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
          queryClient.invalidateQueries({ queryKey: ['workspace', 'partners', 'lookup'] });
        }
        if (capture.extractionStatus === 'FAILED') {
          const copy = ocrFailureCopy(capture.extractionError);
          toast.error(copy.title, copy.action);
        }
      }
    }
    captureStatusRef.current = Object.fromEntries(document.captures.map((row) => [row.id, row.extractionStatus]));
  }, [document, queryClient, t]);

  useEffect(() => {
    setSelectedLineId(null);
    setActiveCaptureId(null);
  }, [id]);

  const { slow: readingSlow, timedOut: readingTimedOut } = useReadingWait(Boolean(document?.extraction?.reading));

  const notSavedOffline = !document && !reachable && detailQuery.failureCount > 0;
  if (detailQuery.isPending && !notSavedOffline) {
    return <p className="py-16 text-center font-sans text-sm text-slate-400">{t('doc.loading')}</p>;
  }
  if (!document) {
    return (
      <div className="py-16 text-center">
        <p className={cn('font-display text-sm', notSavedOffline ? 'text-slate-500' : 'text-ops-danger')}>
          {notSavedOffline ? t('doc.notSavedOffline') : t('doc.notFound')}
        </p>
        <button type="button" className="mt-3 font-display text-[0.8rem] text-ops-accent" onClick={() => navigate('/app/invoices')}>
          {t('pages.backToList')}
        </button>
      </div>
    );
  }

  const editable = writable && canWrite;
  const lines = document.lines;
  const lineTotal = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const reading = Boolean(document.extraction?.reading);
  const failedCapture = document.captures.find((capture) => capture.extractionFailed);
  const ocrError = !reading && failedCapture ? ocrFailureCopy(failedCapture.extractionError) : null;
  const hasLines = lines.length > 0;
  const hasCaptures = document.captures.length > 0;
  const isWriteOff = document.type === 'WRITE_OFF';
  const stockOperation = isStockOperationType(document.type);
  const isTransfer = document.type === 'TRANSFER';
  const evidenceOnly = isWriteOff || stockOperation;
  // Mirrors the API's expiryGuarded(): write-offs, supplier returns and opening stock may carry expired batches.
  const expiryGuardDate =
    !isWriteOff &&
    document.type !== 'OPENING_BALANCE' &&
    (document.direction === 'IN' || document.type === 'TRANSFER' || document.type === 'PROTOCOL')
      ? document.issuedOn
      : undefined;
  const expiredWarnings = posting?.expired ?? [];
  const dateWarning = posting?.dateWarning ?? null;
  const linesToFix = lines.filter((line) => lineIssues(line).length > 0).length;
  const busy = submitDocument.isPending || postDocument.isPending;
  const selectedIndex = lines.findIndex((line) => line.id === selectedLineId);
  const selectedLine = selectedIndex >= 0 ? lines[selectedIndex] : null;

  const selectLine = (lineId: string | null) => {
    setSelectedLineId(lineId);
    const line = lines.find((row) => row.id === lineId);
    if (line?.sourceCaptureId) setActiveCaptureId(line.sourceCaptureId);
  };

  const viewerCaption = selectedLine
    ? selectedLine.sourceCaptureId
      ? t('doc.lineOnPage', { n: selectedIndex + 1, text: selectedLine.printed.description ?? selectedLine.product?.name ?? '' })
      : t('doc.lineByHand', { n: selectedIndex + 1 })
    : null;

  const saveHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!writable) return;
    setHeaderError(null);
    setHeaderDuplicate(null);
    try {
      await updateDocument.mutateAsync({
        siteId: header.siteId,
        documentNumber: header.documentNumber.trim(),
        issuedOn: header.issuedOn,
        ...(stockOperation
          ? isTransfer
            ? { targetSiteId: header.targetSiteId || null }
            : isWriteOff && header.writeOffReason
              ? { writeOffReason: header.writeOffReason }
              : {}
          : {
              type: header.type,
              partnerId: header.partnerId || null,
              direction: defaultStockDirection(header.type),
            }),
      });
      toast.success(t('doc.headerSaved'));
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : t('doc.saveHeaderFailed'));
      setHeaderDuplicate(err instanceof ApiError ? err.existingDocument : null);
    }
  };

  const saveTotals = async (input: PrintedTotalsInput) => {
    try {
      await updateDocument.mutateAsync(input);
      toast.success(t('doc.totals.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.saveHeaderFailed'));
    }
  };

  const runSubmit = async () => {
    try {
      await submitDocument.mutateAsync();
      toast.success(t('doc.submitted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.submitFailed'));
    }
  };

  const runPost = async () => {
    const confirmExpired = Boolean(posting?.confirmExpired);
    const confirmDate = Boolean(posting?.confirmDate);
    const needsConfirmation = confirmExpired || confirmDate;
    const summary = isTransfer
      ? t('doc.postTransferSummary', {
          count: lines.length,
          total: seeFinancials ? formatEuro(lineTotal) : '—',
          from: document.site.name,
          to: document.targetSite?.name ?? '—',
        })
      : t('doc.postSummary', {
          count: lines.length,
          total: seeFinancials ? formatEuro(lineTotal) : '—',
          site: document.site.name,
          direction: document.direction === 'IN' ? t('labels.stockIn') : t('labels.stockOut'),
        });
    const ok = await confirm({
      title: confirmExpired
        ? t('doc.postExpiredTitle', { count: expiredWarnings.length })
        : confirmDate
          ? t('doc.postDateTitle')
          : t('doc.postTitle'),
      details: needsConfirmation ? [...expiredWarnings, ...(dateWarning ? [dateWarning] : [])] : undefined,
      description: [summary, t('doc.postBody')].join(' '),
      acknowledgeLabel: needsConfirmation
        ? [confirmExpired ? t('doc.acknowledgeExpired') : '', confirmDate ? t('doc.acknowledgeDate') : ''].filter(Boolean).join(' ')
        : undefined,
      confirmLabel: confirmExpired ? t('doc.postExpiredConfirm') : confirmDate ? t('doc.postDateConfirm') : t('doc.postNow'),
      danger: needsConfirmation,
    });
    if (!ok) return;
    try {
      // Walks DRAFT → REVIEW → POSTED so the activity log keeps both transitions.
      if (document.status === 'DRAFT') await submitDocument.mutateAsync();
      await postDocument.mutateAsync({ confirmExpired, confirmDate });
      toast.success(t('doc.postedToStock'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.postFailed'));
    }
  };

  const runCancel = async () => {
    const ok = await confirm({
      title: t('doc.cancelTitle'),
      description: t('doc.cancelBody'),
      confirmLabel: t('doc.cancelConfirm'),
      cancelLabel: t('common.back'),
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

  const removeLine = async (lineId: string) => {
    const ok = await confirm({ title: t('doc.removeLineTitle'), confirmLabel: t('doc.removeConfirm'), danger: true });
    if (!ok) return;
    try {
      await deleteLine.mutateAsync(lineId);
      if (selectedLineId === lineId) setSelectedLineId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.removeLineFailed'));
    }
  };

  const attachPhoto = async (file: File) => {
    try {
      await uploadCapture.mutateAsync(file);
      if (evidenceOnly) toast.success(t('writeOff.photoAttached'));
      else toast.success(t('doc.photoAttached'), t('doc.reading'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.uploadFailed'));
    }
  };

  const retryCapture = async (captureId: string) => {
    try {
      await retryExtraction.mutateAsync(captureId);
      toast.info(t('doc.readingAgain'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.retryFailed'));
    }
  };

  const postStatus = reading && !readingTimedOut
    ? t('doc.reading')
    : readingTimedOut
      ? t('doc.readingTimeout')
      : !hasLines
      ? t('doc.addLineFirst')
      : linesToFix > 0
        ? t('doc.linesToFix', { count: linesToFix })
        : posting?.ok
          ? t('doc.readyToPost')
          : (posting?.errors[0] ?? '');

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={[
          document.reversalOf ? t('reversal.eyebrow') : null,
          t(`labels.documentType.${document.type}`),
          isWriteOff && document.writeOffReason ? t(`labels.writeOffReason.${document.writeOffReason}`) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        title={document.documentNumber}
        description={
          isTransfer
            ? `${document.site.name} → ${document.targetSite?.name ?? '—'}`
            : stockOperation
              ? document.site.name
              : `${document.partner?.name ?? t('labels.noPartner')} · ${document.site.name} · ${document.direction === 'IN' ? t('labels.stockIn') : t('labels.stockOut')}`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={document.reversedBy ? 'REVERSED' : document.status} />
            <GhostButton onClick={() => window.print()}>
              <span className="inline-flex items-center gap-1">
                <Printer size={13} /> {t('print.print')}
              </span>
            </GhostButton>
            <GhostButton onClick={() => navigate('/app/invoices')}>
              <span className="inline-flex items-center gap-1">
                <ArrowLeft size={13} /> {t('doc.list')}
              </span>
            </GhostButton>
          </div>
        }
      />

      <ReversalNotice document={document} />

      {document.extraction?.confidence === 'low' && !reading && hasLines && (
        <div className="rounded-xl border border-ops-warn/25 bg-orange-50 px-4 py-3">
          <p className="font-display text-[0.78rem] font-medium text-ops-warn">{t('doc.lowConfidence')}</p>
          <p className="mt-1 font-sans text-[0.76rem] text-ops-warn">{t('doc.lowConfidenceHint')}</p>
        </div>
      )}

      {ocrError && (
        <div className="rounded-xl border border-ops-danger/25 bg-rose-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ops-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[0.82rem] font-semibold text-ops-danger">{ocrError.title}</p>
              <p className="mt-1 font-sans text-[0.78rem] text-rose-800">{ocrError.what}</p>
              <p className="mt-1 font-sans text-[0.76rem] text-rose-700">{ocrError.action}</p>
              {editable && !evidenceOnly && ocrError.retryable && failedCapture && (
                <button
                  type="button"
                  disabled={retryExtraction.isPending}
                  onClick={() => void retryCapture(failedCapture.id)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ops-danger px-3 py-1.5 font-display text-[0.76rem] font-medium text-white disabled:opacity-60"
                >
                  {retryExtraction.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                  {t('doc.retry')}
                </button>
              )}
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

      <div className={cn('grid gap-5 sm:gap-6', hasCaptures && 'md:grid-cols-2 md:items-start')}>
        {hasCaptures && (
          <aside className="sticky top-16 z-20 max-md:bg-ops-canvas max-md:pt-2 md:top-20 md:h-[calc(100dvh-6.5rem)]">
            <DocumentPhotoViewer
              documentId={document.id}
              captures={document.captures}
              activeCaptureId={activeCaptureId}
              onSelectCapture={setActiveCaptureId}
              caption={viewerCaption}
              canAddPage={editable}
              uploading={uploadCapture.isPending}
              onAddPage={() => setCameraOpen(true)}
              canRetry={editable && !evidenceOnly && (ocrError?.retryable ?? true)}
              retrying={retryExtraction.isPending}
              onRetry={retryCapture}
            />
          </aside>
        )}

        <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
          {!hasCaptures && editable && (
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
                  {uploadCapture.isPending ? t('doc.uploading') : evidenceOnly ? t('writeOff.addPhoto') : t('doc.addPicture')}
                </span>
              </button>
              <span className="max-w-sm font-sans text-[0.78rem] text-slate-500">
                {isWriteOff ? t('writeOff.evidenceHint') : stockOperation ? t('doc.evidenceHint') : t('doc.photographHint')}
              </span>
            </div>
          )}

          <GlassPanel title={t('doc.header')}>
            <form className={cn('grid gap-3 sm:grid-cols-2', !hasCaptures && 'md:grid-cols-3')} onSubmit={saveHeader}>
              <div>
                <FieldLabel htmlFor="hdr-type">{t('doc.type')}</FieldLabel>
                <Select<DocumentType>
                  id="hdr-type"
                  value={header.type}
                  onChange={(value) => setHeader((prev) => ({ ...prev, type: value }))}
                  options={(stockOperation ? [document.type] : PAPER_DOCUMENT_TYPES).map((item) => ({
                    value: item,
                    label: t(`labels.documentType.${item}`),
                  }))}
                  disabled={!editable || stockOperation}
                />
              </div>
              <div>
                <FieldLabel htmlFor="hdr-site">{isTransfer ? t('transfer.from') : t('doc.site')}</FieldLabel>
                <Select
                  id="hdr-site"
                  value={header.siteId}
                  onChange={(value) => setHeader((prev) => ({ ...prev, siteId: value }))}
                  options={sites.map((site) => ({ value: site.id, label: site.name }))}
                  disabled={!editable}
                />
              </div>
              {isTransfer ? (
                <div>
                  <FieldLabel htmlFor="hdr-target">{t('transfer.to')}</FieldLabel>
                  <Select
                    id="hdr-target"
                    value={header.targetSiteId}
                    onChange={(value) => setHeader((prev) => ({ ...prev, targetSiteId: value }))}
                    placeholder={t('transfer.pickSite')}
                    options={(targetsQuery.data?.sites ?? (document.targetSite ? [document.targetSite] : []))
                      .filter((site) => site.id !== header.siteId)
                      .map((site) => ({ value: site.id, label: site.name }))}
                    disabled={!editable}
                  />
                </div>
              ) : (
                !stockOperation && (
                  <div>
                    <FieldLabel htmlFor="hdr-partner">{t('doc.partner')}</FieldLabel>
                    <Select
                      id="hdr-partner"
                      value={header.partnerId}
                      onChange={(value) => setHeader((prev) => ({ ...prev, partnerId: value }))}
                      options={[
                        {
                          value: '',
                          label:
                            header.type === 'INVOICE' || header.type === 'CREDIT_NOTE'
                              ? t('doc.partnerRequired')
                              : t('labels.noPartner'),
                        },
                        ...partners.map((partner) => ({ value: partner.id, label: partner.name })),
                      ]}
                      disabled={!editable}
                    />
                    {editable && seeFinancials && (header.type === 'INVOICE' || header.type === 'CREDIT_NOTE') && (
                      <InlineCreateSupplier
                        disabled={updateDocument.isPending}
                        onCreated={(partnerId) => setHeader((prev) => ({ ...prev, partnerId }))}
                      />
                    )}
                  </div>
                )
              )}
              <div>
                <FieldLabel htmlFor="hdr-number">{t('doc.documentNumber')}</FieldLabel>
                <input
                  id="hdr-number"
                  value={header.documentNumber}
                  onChange={(event) => setHeader((prev) => ({ ...prev, documentNumber: event.target.value }))}
                  disabled={!editable}
                  className={fieldClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="hdr-date">{t('doc.issuedOn')}</FieldLabel>
                <DateField
                  id="hdr-date"
                  value={header.issuedOn}
                  onChange={(value) => setHeader((prev) => ({ ...prev, issuedOn: value }))}
                  disabled={!editable}
                  className="w-full"
                />
                {writable && <DateSanityHint issuedOn={header.issuedOn} type={header.type} />}
              </div>
              {isWriteOff && (
                <div>
                  <FieldLabel htmlFor="hdr-reason">{t('writeOff.reasonField')}</FieldLabel>
                  <Select<WriteOffReason | ''>
                    id="hdr-reason"
                    value={header.writeOffReason}
                    onChange={(value) => setHeader((prev) => ({ ...prev, writeOffReason: value }))}
                    options={WRITE_OFF_REASONS.map((reason) => ({ value: reason, label: t(`labels.writeOffReason.${reason}`) }))}
                    disabled={!editable}
                  />
                </div>
              )}
              {editable && (
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
                <div className="sm:col-span-2 md:col-span-3">
                  {headerDuplicate ? <DuplicateNotice duplicate={headerDuplicate} /> : <FieldError>{headerError}</FieldError>}
                </div>
              )}
            </form>
          </GlassPanel>

          <GlassPanel
            padded={false}
            title={t('doc.lines')}
            action={hasLines && seeFinancials ? <LiveBadge>{formatEuro(lineTotal)}</LiveBadge> : undefined}
          >
            {reading && !readingTimedOut && (
              <div
                className={cn(
                  'flex items-center gap-3 px-4 sm:px-5',
                  hasLines ? 'border-b border-indigo-100 bg-indigo-50 py-3' : 'flex-col justify-center py-12',
                )}
              >
                <Loader2 size={hasLines ? 18 : 28} className="animate-spin text-ops-accent" />
                <div className={cn(!hasLines && 'text-center')}>
                  <p className="font-display text-[0.9rem] font-medium text-ops-accent">{t('doc.reading')}</p>
                  <p className="max-w-sm font-sans text-[0.74rem] text-slate-500">
                    {readingSlow ? t('doc.readingSlow') : hasLines ? t('doc.readingNewLines') : t('doc.readingHint')}
                  </p>
                  {detailQuery.isRefetchError && (
                    <p className="max-w-sm font-sans text-[0.74rem] text-ops-warn">{t('doc.readingCheckFailed')}</p>
                  )}
                </div>
              </div>
            )}

            {reading && readingTimedOut && (
              <div
                className={cn(
                  'flex items-start gap-3 border-ops-danger/25 bg-rose-50 px-4 py-3 sm:px-5',
                  hasLines ? 'border-b' : 'flex-col items-center py-10',
                )}
              >
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ops-danger" />
                <div className={cn('min-w-0 flex-1', !hasLines && 'text-center')}>
                  <p className="font-display text-[0.82rem] font-semibold text-ops-danger">{t('doc.readingTimeout')}</p>
                  <p className="mt-1 font-sans text-[0.76rem] text-rose-800">{t('doc.readingTimeoutHint')}</p>
                  {editable && !evidenceOnly && document.captures[0] && (
                    <button
                      type="button"
                      disabled={retryExtraction.isPending}
                      onClick={() => void retryCapture(document.captures[document.captures.length - 1]!.id)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ops-danger px-3 py-1.5 font-display text-[0.75rem] font-medium text-white disabled:opacity-60"
                    >
                      {retryExtraction.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                      {t('doc.retry')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasLines && (
              <DocumentLines
                lines={lines}
                editable={editable}
                selectedLineId={selectedLineId}
                onSelect={selectLine}
                onUpdate={async (lineId, input) => {
                  await updateLine.mutateAsync({ lineId, ...input });
                }}
                onDelete={removeLine}
                onCreateProduct={async (lineId, input) => {
                  await createProduct.mutateAsync({ lineId, ...input });
                  toast.success(t('scanMatch.created', { name: input.name }));
                }}
                onConfirmProduct={async (productId) => {
                  try {
                    await confirmProduct.mutateAsync(productId);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('doc.saveLineFailed'));
                  }
                }}
                saving={updateLine.isPending || createProduct.isPending || confirmProduct.isPending}
                expiryGuardDate={expiryGuardDate}
              />
            )}

            {!hasLines && !reading && !manualAdd && (
              <div className="px-4 py-8 text-center sm:px-5">
                <p className="font-display text-[0.88rem] font-medium text-ops-ink">
                  {ocrError ? t('doc.linesNotFilled') : evidenceOnly ? t('writeOff.emptyItems') : t('doc.waitingPhoto')}
                </p>
                <p className="mx-auto mt-1 max-w-md font-sans text-[0.78rem] text-slate-500">
                  {ocrError
                    ? t('doc.linesNotFilledHint')
                    : isWriteOff
                      ? t('writeOff.noLinesHint')
                      : stockOperation
                        ? t('doc.addLinesHint')
                        : t('doc.waitingPhotoHint')}
                </p>
              </div>
            )}

            {editable && manualAdd && (
              <div className="border-t border-slate-100 p-4 sm:px-5">
                <LineForm
                  saving={addLine.isPending}
                  expiryGuardDate={expiryGuardDate}
                  onCancel={() => setManualAdd(false)}
                  onSubmit={async (input) => {
                    await addLine.mutateAsync(input);
                  }}
                />
              </div>
            )}

            {editable && !manualAdd && (
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

          {document.totals && seeFinancials && (
            <DocumentTotalsPanel
              totals={document.totals}
              paymentMethod={document.paymentMethod}
              lineCount={lines.length}
              type={document.type}
              editable={editable}
              saving={updateDocument.isPending}
              onSave={saveTotals}
            />
          )}

          {writable && posting?.duplicateOf && <DuplicateNotice duplicate={posting.duplicateOf} blocking />}

          {editable && expiredWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3">
              <p className="flex items-center gap-2 font-display text-[0.8rem] font-semibold text-amber-800">
                <TriangleAlert size={15} /> {t('doc.expiredWarningTitle', { count: expiredWarnings.length })}
              </p>
              <ul className="mt-1.5 list-disc pl-6 font-sans text-[0.76rem] text-amber-800">
                {expiredWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="mt-1.5 font-sans text-[0.74rem] text-amber-700">
                {document.direction === 'IN' ? t('doc.expiredReceivedHint') : t('doc.expiredWarningHint')}
              </p>
            </div>
          )}

          {editable && (
            <div className={cn(glassClass, 'flex flex-wrap items-center gap-3 px-4 py-3')}>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[0.86rem] font-semibold text-ops-ink">
                  {seeFinancials
                    ? `${t('doc.linesSummary', { count: lines.length })} · ${formatEuro(lineTotal)}`
                    : t('doc.linesSummary', { count: lines.length })}
                </p>
                <p className={cn('truncate font-sans text-[0.72rem]', posting?.ok && !reading ? 'text-ops-teal' : 'text-ops-warn')}>
                  {postStatus}
                </p>
              </div>
              {document.status === 'DRAFT' && posting?.ok && !reading && (
                <GhostButton onClick={runSubmit}>{t('doc.sendForReview')}</GhostButton>
              )}
              {canPost && (
                <ActionButton
                  icon={CheckCircle2}
                  label={t('doc.postNow')}
                  onClick={runPost}
                  primary
                  disabled={busy || reading || !posting?.ok}
                />
              )}
            </div>
          )}

          {editable && canCancel && (
            <div className="flex justify-end">
              <GhostButton danger onClick={runCancel}>
                {t('doc.cancelDocument')}
              </GhostButton>
            </div>
          )}

          {canReverse && document.reversible && <ReversePanel document={document} />}
        </div>
      </div>

      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={attachPhoto} />
      <DocumentPrintView document={document} />
    </div>
  );
};
