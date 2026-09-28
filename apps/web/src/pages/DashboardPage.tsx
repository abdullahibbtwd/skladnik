import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import { DashboardContext } from '../components/dashboard/dashboard-context';
import { useMeQuery } from '../lib/auth-session';
import { applySession, useAuthUser } from '../lib/auth-store';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CameraCapture } from '../components/dashboard/CameraCapture';
import { persistSiteId, storedSiteId } from '../lib/active-site';
import { businessToday } from '../lib/business-date';
import { checkConnectivity, markUnreachable, useConnectivity } from '../lib/connectivity';
import { buildDashboardState, type Notice, type StockLine } from '../lib/dashboard-data';
import { readOfflineSession } from '../lib/offline-session';
import { newQueueId } from '../lib/photo-queue';
import { isQuotaError, queuePhoto, usePhotoQueueRuntime } from '../lib/photo-queue-runtime';
import { isTransientStatus } from '../lib/photo-sync';
import { ApiError, scanDocument } from '../lib/workspace-api';
import { useDocumentsQuery, useSiteChoices, useStockQuery } from '../lib/workspace-session';
import { toast } from '../components/ui/Toaster';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const storeUser = useAuthUser();
  const meQuery = useMeQuery();
  const user = meQuery.data ?? storeUser;
  /** The session can't be checked right now (offline, or the API is down), as opposed to being signed out. */
  const sessionUnreachable = meQuery.data === undefined && (meQuery.isError || meQuery.fetchStatus === 'paused');
  const { sites } = useSiteChoices();
  const documentsQuery = useDocumentsQuery();
  const [siteId, setSiteIdState] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanUploading, setScanUploading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionUnreachable || storeUser) return;
    const offline = readOfflineSession();
    if (offline) applySession(offline.user);
  }, [sessionUnreachable, storeUser]);

  usePhotoQueueRuntime(user?.id);

  const setSiteId = useCallback(
    (id: string) => {
      setSiteIdState(id);
      persistSiteId(user, id);
    },
    [user],
  );

  useEffect(() => {
    if (sites.length === 0) return;
    if (sites.some((site) => site.id === siteId)) return;
    const stored = storedSiteId(user);
    setSiteIdState(sites.find((site) => site.id === stored)?.id ?? sites[0].id);
  }, [sites, siteId, user]);

  const stockQuery = useStockQuery(siteId);

  const data = useMemo(() => {
    const documents = (documentsQuery.data?.documents ?? []).filter(
      (doc) => !siteId || doc.site.id === siteId || doc.targetSite?.id === siteId,
    );
    const next = buildDashboardState(documents, stockQuery.data?.siteId === siteId ? stockQuery.data.items : undefined);
    const notices: (Notice | null)[] = [
      next.pending.length > 0
        ? { text: t('notices.invoicesWaiting', { count: next.pending.length }), to: '/app/invoices' }
        : null,
      next.reorderCount > 0 ? { text: t('notices.belowMin', { count: next.reorderCount }), to: '/app/reorder' } : null,
      next.expired > 0 ? { text: t('notices.expiredBatches', { count: next.expired }), to: '/app/expiry' } : null,
    ];
    return { ...next, notifications: notices.filter((note): note is Notice => note !== null) };
  }, [documentsQuery.data, stockQuery.data, siteId, t]);

  if (!user) {
    const offlineSnapshot = sessionUnreachable && readOfflineSession() !== null;
    if ((meQuery.isPending && meQuery.fetchStatus !== 'paused') || offlineSnapshot) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
          {t('session.restoring')}
        </div>
      );
    }
    if (sessionUnreachable) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ops-canvas px-6 text-center" data-testid="session-unreachable">
          <p className="font-display text-base font-semibold text-ops-ink">{t('session.unreachableTitle')}</p>
          <p className="max-w-sm font-sans text-sm text-slate-500">{t('session.unreachableBody')}</p>
          <button
            type="button"
            onClick={() => void meQuery.refetch()}
            disabled={meQuery.isFetching}
            className="mt-1 rounded-xl bg-ops-teal px-4 py-2 font-display text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {meQuery.isFetching ? t('common.loading') : t('session.retry')}
          </button>
        </div>
      );
    }
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  const canCreateDocuments = user.role === 'OWNER' || user.role === 'ACCOUNTANT' || user.role === 'SITE_MANAGER';

  const onStartDocument = (type: 'RECEIPT' | 'PROTOCOL') => {
    if (!canCreateDocuments) {
      toast.error(t('app.docStaffBlocked'));
      return;
    }
    if (!siteId) {
      toast.error(t('app.docNeedSite'));
      return;
    }
    navigate(type === 'PROTOCOL' ? '/app/write-off' : `/app/invoices/new?type=${type}`);
  };

  const onWriteOffBatch = (line: StockLine) => {
    if (!canCreateDocuments) {
      toast.error(t('app.docStaffBlocked'));
      return;
    }
    const params = new URLSearchParams({ productId: line.productId, batchId: line.batchId, reason: 'EXPIRED' });
    navigate(`/app/write-off?${params}`);
  };

  const onScan = () => {
    if (!canCreateDocuments) {
      toast.error(t('app.scanStaffBlocked'));
      return;
    }
    if (!siteId) {
      toast.error(t('app.scanNeedSite'));
      return;
    }
    setScanOpen(true);
  };

  /** The site, business day and id are fixed at capture time, so a photo queued offline uploads exactly as it was taken. */
  const onScanCaptured = async (file: File) => {
    if (scanUploading) return;
    const site = sites.find((row) => row.id === siteId);
    if (!site) {
      toast.error(t('app.scanNeedSite'));
      return;
    }
    const capturedAt = new Date();
    const id = newQueueId();
    const issuedOn = businessToday(capturedAt);

    const queue = async () => {
      try {
        await queuePhoto({ id, user, site, documentType: 'INVOICE', issuedOn, capturedAt, file });
        toast.info(t('photoQueue.queuedTitle'), t('photoQueue.queuedBody', { site: site.name }), {
          action: { label: t('photoQueue.view'), onClick: () => navigate('/app/photo-queue') },
        });
      } catch (err) {
        toast.error(isQuotaError(err) ? t('photoQueue.storageFull') : t('photoQueue.queueFailed'));
      }
    };

    const reachable = useConnectivity.getState().reachable || (await checkConnectivity());
    if (!navigator.onLine || !reachable) {
      await queue();
      return;
    }

    setScanUploading(true);
    try {
      const created = await scanDocument({ clientRequestId: id, siteId: site.id, type: 'INVOICE', issuedOn, capturedAt: capturedAt.toISOString(), file });
      navigate(`/app/invoices/${created.document.id}`);
    } catch (err) {
      if (err instanceof ApiError && !isTransientStatus(err.status)) {
        toast.error(err.message || t('app.scanCreateFailed'));
      } else {
        markUnreachable();
        await queue();
      }
    } finally {
      setScanUploading(false);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'documents'] });
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        siteId,
        setSiteId,
        data,
        onScan,
        startDocument: onStartDocument,
        writeOff: onWriteOffBatch,
        markReviewed: () => navigate('/app/invoices'),
      }}
    >
      <DashboardShell
        siteId={siteId}
        onSiteChange={setSiteId}
        notifications={data.notifications}
        onScan={onScan}
        onStartDocument={onStartDocument}
      />
      <CameraCapture open={scanOpen} onClose={() => setScanOpen(false)} onCapture={onScanCaptured} />
      {scanUploading && (
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-3 bg-black/70 font-display text-[0.9rem] text-white">
          <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {t('app.scanUploading')}
        </div>
      )}
    </DashboardContext.Provider>
  );
};
