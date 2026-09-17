import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import { DashboardContext } from '../components/dashboard/dashboard-context';
import { useMeQuery } from '../lib/auth-session';
import { useAuthUser } from '../lib/auth-store';
import { useTranslation } from 'react-i18next';
import { buildDashboardState } from '../lib/dashboard-data';
import { useCreateDocument, useDocumentsQuery, useSitesQuery } from '../lib/workspace-session';
import { toast } from '../components/ui/Toaster';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const storeUser = useAuthUser();
  const meQuery = useMeQuery();
  const user = meQuery.data ?? storeUser;
  const sitesQuery = useSitesQuery();
  const documentsQuery = useDocumentsQuery();
  const createDocument = useCreateDocument();
  const sites = useMemo(
    () => (sitesQuery.data?.sites ?? []).filter((site) => site.isActive),
    [sitesQuery.data],
  );
  const [siteId, setSiteId] = useState('');

  useEffect(() => {
    if (sites.length === 0) return;
    if (sites.some((site) => site.id === siteId)) return;
    setSiteId(sites[0].id);
  }, [sites, siteId]);

  const data = useMemo(() => {
    const documents = (documentsQuery.data?.documents ?? []).filter((doc) => !siteId || doc.site.id === siteId);
    const next = buildDashboardState(documents);
    return {
      ...next,
      notifications: [
        next.pending.length > 0 ? t('notices.invoicesWaiting', { count: next.pending.length }) : null,
      ].filter((note): note is string => Boolean(note)),
    };
  }, [documentsQuery.data, siteId, t]);

  if (!user) {
    if (meQuery.isPending || !meQuery.isFetched) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
          {t('session.restoring')}
        </div>
      );
    }
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  const onScan = async () => {
    if (user.role !== 'OWNER' && user.role !== 'ACCOUNTANT' && user.role !== 'SITE_MANAGER') {
      toast.error(t('app.scanStaffBlocked'));
      return;
    }
    if (!siteId) {
      toast.error(t('app.scanNeedSite'));
      return;
    }
    if (createDocument.isPending) return;
    try {
      const result = await createDocument.mutateAsync({
        type: 'INVOICE',
        siteId,
        documentNumber: `SCAN-${Date.now()}`,
        issuedOn: new Date().toISOString().slice(0, 10),
      });
      navigate(`/app/invoices/${result.document.id}?camera=1`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('app.scanCreateFailed'));
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        siteId,
        setSiteId,
        data,
        onScan,
        writeOff: () => navigate('/app/expiry'),
        markReviewed: () => navigate('/app/invoices'),
      }}
    >
      <DashboardShell siteId={siteId} onSiteChange={setSiteId} notifications={data.notifications} onScan={onScan} />
    </DashboardContext.Provider>
  );
};
