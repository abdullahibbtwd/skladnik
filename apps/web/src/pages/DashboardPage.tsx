import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { SampleInvoice } from '../components/HeroSection';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import { DashboardContext } from '../components/dashboard/dashboard-context';
import { useMeQuery } from '../lib/auth-session';
import { useAuthUser } from '../lib/auth-store';
import { buildDashboardState } from '../lib/dashboard-data';

interface DashboardPageProps {
  committedInvoices: SampleInvoice[];
  onScan: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ committedInvoices, onScan }) => {
  const user = useAuthUser();
  const { isPending, isFetched } = useMeQuery();
  const [siteId, setSiteId] = useState('central');
  const [writtenOff, setWrittenOff] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const data = useMemo(() => {
    const next = buildDashboardState(committedInvoices, siteId);
    return {
      ...next,
      lines: next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`)),
      fefoBoard: next.fefoBoard.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`)),
      lowStock: next.lowStock.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`)),
      pending: next.pending.filter((row) => !reviewed.includes(row.id)),
      expiring: {
        3: next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`) && line.daysLeft <= 3).length,
        7: next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`) && line.daysLeft <= 7).length,
        14: next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`) && line.daysLeft <= 14).length,
        30: next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`) && line.daysLeft <= 30).length,
      },
      catalogCount: next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`)).length,
      stockValue: next.lines
        .filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`))
        .reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
      notifications: [
        next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`) && line.daysLeft <= 3).length > 0
          ? `${next.lines.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`) && line.daysLeft <= 3).length} batches hit the 3-day FEFO threshold`
          : null,
        next.pending.filter((row) => !reviewed.includes(row.id)).length > 0
          ? `${next.pending.filter((row) => !reviewed.includes(row.id)).length} invoices waiting for review`
          : null,
        next.lowStock.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`)).length > 0
          ? `${next.lowStock.filter((line) => !writtenOff.includes(`${line.sku}-${line.batch}`)).length} items at or below min stock`
          : null,
      ].filter((note): note is string => Boolean(note)),
    };
  }, [committedInvoices, siteId, writtenOff, reviewed]);

  if (!user) {
    if (isPending || !isFetched) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
          Restoring session…
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  };

  return (
    <DashboardContext.Provider
      value={{
        siteId,
        setSiteId,
        data,
        toast,
        onScan,
        writeOff: (sku, batch) => {
          const key = `${sku}-${batch}`;
          setWrittenOff((prev) => (prev.includes(key) ? prev : [...prev, key]));
          flash('Write-off posted. Batch removed from the live board.');
        },
        markReviewed: (id) => {
          setReviewed((prev) => (prev.includes(id) ? prev : [...prev, id]));
          flash('Invoice marked reviewed.');
        },
      }}
    >
      <DashboardShell siteId={siteId} onSiteChange={setSiteId} notifications={data.notifications} onScan={onScan} />
    </DashboardContext.Provider>
  );
};
