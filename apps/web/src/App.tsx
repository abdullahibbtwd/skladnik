import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HeroSection, SAMPLE_INVOICES, type SampleInvoice } from './components/HeroSection';
import { CoreFeatures } from './components/CoreFeatures';
import { HowItWorks } from './components/HowItWorks';
import { PricingSection } from './components/PricingSection';
import { Footer } from './components/Footer';
import { InteractiveModal } from './components/InteractiveModal';
import { AuthModal } from './components/AuthModal';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { OverviewPanel } from './components/dashboard/OverviewPanel';
import {
  AuditPanel,
  ExpiryPanel,
  InventoryPanel,
  InvoicesPanel,
  PosPanel,
  SettingsPanel,
} from './components/dashboard/WorkspacePanels';
import { useMeQuery } from './lib/auth-session';
import { useIsAuthenticated } from './lib/auth-store';

function SessionSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
      Restoring session…
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthenticated = useIsAuthenticated();
  const { isFetched } = useMeQuery();
  const [scanDemoOpen, setScanDemoOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [pendingInvoice, setPendingInvoice] = useState<SampleInvoice | null>(null);
  const [committedInvoices, setCommittedInvoices] = useState<SampleInvoice[]>([]);

  useEffect(() => {
    const auth = searchParams.get('auth');
    if (auth !== 'login' && auth !== 'signup') return;
    setAuthMode(auth);
    setAuthModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('auth');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleCommitInventory = (invoice: SampleInvoice) => {
    if (isAuthenticated) {
      setCommittedInvoices((prev) => {
        const exists = prev.some((inv) => inv.id === invoice.id);
        return exists ? prev : [...prev, invoice];
      });
      navigate('/app');
    } else {
      setPendingInvoice(invoice);
      setAuthMode('signup');
      setAuthModalOpen(true);
    }
  };

  const handleAuthSuccess = () => {
    if (pendingInvoice) {
      setCommittedInvoices((prev) => {
        const exists = prev.some((inv) => inv.id === pendingInvoice.id);
        return exists ? prev : [...prev, pendingInvoice];
      });
      setPendingInvoice(null);
    } else if (committedInvoices.length === 0) {
      setCommittedInvoices([SAMPLE_INVOICES[0]]);
    }
    setAuthModalOpen(false);
    navigate('/app');
  };

  const landing = (
    <div className="w-full max-w-full overflow-x-hidden bg-ops-canvas pt-[4.5rem] font-sans text-ops-ink">
      <Navbar onOpenDemo={() => setScanDemoOpen(true)} />

      <main>
        <HeroSection
          onOpenDemo={() => setScanDemoOpen(true)}
          onCommitInventory={handleCommitInventory}
          isCommitted={committedInvoices.length > 0}
        />
        <CoreFeatures onOpenDemo={() => setScanDemoOpen(true)} />
        <HowItWorks />
        <PricingSection onOpenDemo={() => setScanDemoOpen(true)} />
      </main>

      <Footer />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
        pendingInvoice={pendingInvoice}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            !isAuthenticated && !isFetched ? (
              <SessionSplash />
            ) : isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthPage mode="login" pendingInvoice={null} onSuccess={handleAuthSuccess} />
            )
          }
        />
        <Route
          path="/signup"
          element={
            !isAuthenticated && !isFetched ? (
              <SessionSplash />
            ) : isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthPage mode="signup" pendingInvoice={pendingInvoice} onSuccess={handleAuthSuccess} />
            )
          }
        />
        <Route
          path="/app"
          element={<DashboardPage committedInvoices={committedInvoices} onScan={() => setScanDemoOpen(true)} />}
        >
          <Route index element={<OverviewPanel />} />
          <Route path="invoices" element={<InvoicesPanel />} />
          <Route path="inventory" element={<InventoryPanel />} />
          <Route path="expiry" element={<ExpiryPanel />} />
          <Route path="pos" element={<PosPanel />} />
          <Route path="audit" element={<AuditPanel />} />
          <Route path="settings" element={<SettingsPanel />} />
        </Route>
        <Route path="*" element={landing} />
      </Routes>

      <InteractiveModal
        isOpen={scanDemoOpen}
        onClose={() => setScanDemoOpen(false)}
        onCommitInventory={handleCommitInventory}
      />
    </>
  );
}
