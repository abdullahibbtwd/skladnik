import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CoreFeatures } from './components/CoreFeatures';
import { HowItWorks } from './components/HowItWorks';
import { PricingSection } from './components/PricingSection';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { OverviewPanel } from './components/dashboard/OverviewPanel';
import { InventoryPanel } from './components/dashboard/InventoryPanel';
import { InvoicesPanel } from './components/dashboard/InvoicesPanel';
import { DocumentCreatePanel, DocumentDetailPanel } from './components/dashboard/DocumentEditor';
import { AuditPanel, ExpiryPanel, PosPanel, SettingsAccountPanel } from './components/dashboard/WorkspacePanels';
import { SettingsLayout } from './components/dashboard/SettingsLayout';
import { SitesSettings } from './components/dashboard/SitesSettings';
import { UsersSettings } from './components/dashboard/UsersSettings';
import { ProductGroupsSettings } from './components/dashboard/ProductGroupsSettings';
import { PartnersSettings } from './components/dashboard/PartnersSettings';
import { UnitsSettings } from './components/dashboard/UnitsSettings';
import { appReturnPath, useMeQuery } from './lib/auth-session';
import { useIsAuthenticated } from './lib/auth-store';
import { useTranslation } from 'react-i18next';

function SessionSplash() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
      {t('session.restoring')}
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const meQuery = useMeQuery();
  const isAuthenticated = useIsAuthenticated() || Boolean(meQuery.data);
  const { isFetched } = meQuery;
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');

  useEffect(() => {
    const auth = searchParams.get('auth');
    if (auth !== 'login' && auth !== 'signup') return;
    setAuthMode(auth);
    setAuthModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('auth');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleAuthSuccess = () => {
    setAuthModalOpen(false);
    navigate(appReturnPath(location.state));
  };

  const landing = (
    <div className="w-full max-w-full overflow-x-hidden bg-ops-canvas pt-[4.5rem] font-sans text-ops-ink">
      <Navbar />

      <main>
        <HeroSection />
        <CoreFeatures />
        <HowItWorks />
        <PricingSection />
      </main>

      <Footer />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !isAuthenticated && !isFetched ? (
            <SessionSplash />
          ) : isAuthenticated ? (
            <Navigate to={appReturnPath(location.state)} replace />
          ) : (
            <AuthPage mode="login" onSuccess={handleAuthSuccess} />
          )
        }
      />
      <Route
        path="/signup"
        element={
          !isAuthenticated && !isFetched ? (
            <SessionSplash />
          ) : isAuthenticated ? (
            <Navigate to={appReturnPath(location.state)} replace />
          ) : (
            <AuthPage mode="signup" onSuccess={handleAuthSuccess} />
          )
        }
      />
      <Route path="/app" element={<DashboardPage />}>
        <Route index element={<OverviewPanel />} />
        <Route path="invoices">
          <Route index element={<InvoicesPanel />} />
          <Route path="new" element={<DocumentCreatePanel />} />
          <Route path=":id" element={<DocumentDetailPanel />} />
        </Route>
        <Route path="inventory" element={<InventoryPanel />} />
        <Route path="expiry" element={<ExpiryPanel />} />
        <Route path="pos" element={<PosPanel />} />
        <Route path="audit" element={<AuditPanel />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsAccountPanel />} />
          <Route path="sites" element={<SitesSettings />} />
          <Route path="users" element={<UsersSettings />} />
          <Route path="groups" element={<ProductGroupsSettings />} />
          <Route path="partners" element={<PartnersSettings />} />
          <Route path="units" element={<UnitsSettings />} />
        </Route>
      </Route>
      <Route path="*" element={landing} />
    </Routes>
  );
}
