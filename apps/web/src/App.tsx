import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CoreFeatures } from './components/CoreFeatures';
import { HowItWorks } from './components/HowItWorks';
import { PricingSection } from './components/PricingSection';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { AuthPage } from './pages/AuthPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { DashboardPage } from './pages/DashboardPage';
import { OverviewPanel } from './components/dashboard/OverviewPanel';
import { InventoryPanel } from './components/dashboard/InventoryPanel';
import { StockPanel } from './components/dashboard/StockPanel';
import { WriteOffPanel } from './components/dashboard/WriteOffPanel';
import { TransferPanel } from './components/dashboard/TransferPanel';
import { StocktakeListPanel, StocktakeSheetPanel } from './components/dashboard/StocktakePanel';
import { OpeningStockPanel } from './components/dashboard/OpeningStockPanel';
import { MovementHistoryPanel } from './components/dashboard/MovementHistoryPanel';
import { ReorderPanel } from './components/dashboard/ReorderPanel';
import { InvoicesPanel } from './components/dashboard/InvoicesPanel';
import { DocumentCreatePanel } from './components/dashboard/DocumentEditor';
import { DocumentDetailPanel } from './components/dashboard/DocumentDetailPanel';
import { PosPanel } from './components/dashboard/PosPanel';
import { SalesPanel } from './components/dashboard/SalesPanel';
import { SaleReceiptPanel } from './components/dashboard/SaleReceiptPanel';
import { MarginsPanel } from './components/dashboard/MarginsPanel';
import { PhotoQueuePanel } from './components/dashboard/PhotoQueuePanel';
import { ExpiryPanel, SettingsAccountPanel } from './components/dashboard/WorkspacePanels';
import { Annex38Panel } from './components/dashboard/Annex38Panel';
import { SettingsLayout } from './components/dashboard/SettingsLayout';
import { SitesSettings } from './components/dashboard/SitesSettings';
import { UsersSettings } from './components/dashboard/UsersSettings';
import { ProductGroupsSettings } from './components/dashboard/ProductGroupsSettings';
import { PartnersSettings } from './components/dashboard/PartnersSettings';
import { UnitsSettings } from './components/dashboard/UnitsSettings';
import { CompanySettings } from './components/dashboard/CompanySettings';
import { DocumentSettings } from './components/dashboard/DocumentSettings';
import { StockRulesSettings } from './components/dashboard/StockRulesSettings';
import { ActivityLogPanel } from './components/dashboard/ActivityLogPanel';
import { RequirePermission } from './components/dashboard/RequirePermission';
import { appReturnPath, useMeQuery } from './lib/auth-session';
import { useIsAuthenticated } from './lib/auth-store';
import { useTranslation } from 'react-i18next';

const RecipesPanel = lazy(() =>
  import('./components/dashboard/RecipesPanel').then((m) => ({ default: m.RecipesPanel })),
);
const RecipeNewPanel = lazy(() =>
  import('./components/dashboard/RecipesPanel').then((m) => ({ default: m.RecipeNewPanel })),
);
const RecipeEditorPanel = lazy(() =>
  import('./components/dashboard/RecipesPanel').then((m) => ({ default: m.RecipeEditorPanel })),
);
const ReportsHubPanel = lazy(() =>
  import('./components/dashboard/ReportsPanel').then((m) => ({ default: m.ReportsHubPanel })),
);
const ReportPanel = lazy(() =>
  import('./components/dashboard/ReportsPanel').then((m) => ({ default: m.ReportPanel })),
);
const ArchivePanel = lazy(() =>
  import('./components/dashboard/ArchivePanel').then((m) => ({ default: m.ArchivePanel })),
);
const ExportLayoutsPanel = lazy(() =>
  import('./components/dashboard/ExportLayoutsPanel').then((m) => ({ default: m.ExportLayoutsPanel })),
);
const ExportLayoutEditorPanel = lazy(() =>
  import('./components/dashboard/ExportLayoutsPanel').then((m) => ({ default: m.ExportLayoutEditorPanel })),
);
const VatPanel = lazy(() =>
  import('./components/dashboard/VatPanel').then((m) => ({ default: m.VatPanel })),
);

function SessionSplash() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
      {t('session.restoring')}
    </div>
  );
}

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] items-center justify-center font-display text-sm text-slate-500">
      {t('session.loadingPanel')}
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
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
      <Route path="/forgot-password" element={<PasswordResetPage mode="forgot" />} />
      <Route path="/reset-password" element={<PasswordResetPage mode="reset" />} />
      <Route path="/app" element={<DashboardPage />}>
        <Route index element={<OverviewPanel />} />
        <Route path="invoices">
          <Route index element={<InvoicesPanel />} />
          <Route element={<RequirePermission permission="createDocuments" fallback="/app/invoices" />}>
            <Route path="new" element={<DocumentCreatePanel />} />
          </Route>
          <Route path=":id" element={<DocumentDetailPanel />} />
        </Route>
        <Route path="stock" element={<StockPanel />} />
        <Route path="stock/:productId" element={<MovementHistoryPanel />} />
        <Route path="stocktake/:id" element={<StocktakeSheetPanel />} />
        <Route element={<RequirePermission permission="createDocuments" />}>
          <Route path="write-off" element={<WriteOffPanel />} />
          <Route path="photo-queue" element={<PhotoQueuePanel />} />
        </Route>
        <Route element={<RequirePermission permission="stockOps" />}>
          <Route path="transfer" element={<TransferPanel />} />
          <Route path="stocktake" element={<StocktakeListPanel />} />
        </Route>
        <Route element={<RequirePermission permission="openingStock" fallback="/app/stock" />}>
          <Route path="opening-stock" element={<OpeningStockPanel />} />
        </Route>
        <Route path="reorder" element={<ReorderPanel />} />
        <Route path="inventory" element={<InventoryPanel />} />
        <Route path="expiry" element={<ExpiryPanel />} />
        <Route element={<RequirePermission permission="pos" />}>
          <Route path="pos" element={<PosPanel />} />
        </Route>
        <Route element={<RequirePermission permission="salesRead" />}>
          <Route path="sales">
            <Route index element={<SalesPanel />} />
            <Route element={<RequirePermission permission="reports" fallback="/app/sales" />}>
              <Route path="margins" element={<MarginsPanel />} />
            </Route>
            <Route path=":id" element={<SaleReceiptPanel />} />
          </Route>
        </Route>
        <Route path="recipes" element={<RequirePermission permission="manage" />}>
          <Route
            index
            element={
              <LazyRoute>
                <RecipesPanel />
              </LazyRoute>
            }
          />
          <Route
            path="new"
            element={
              <LazyRoute>
                <RecipeNewPanel />
              </LazyRoute>
            }
          />
          <Route
            path=":productId"
            element={
              <LazyRoute>
                <RecipeEditorPanel />
              </LazyRoute>
            }
          />
        </Route>
        <Route path="reports" element={<RequirePermission permission="reports" />}>
          <Route
            index
            element={
              <LazyRoute>
                <ReportsHubPanel />
              </LazyRoute>
            }
          />
          <Route element={<RequirePermission permission="documentArchive" fallback="/app/reports" />}>
            <Route
              path="archive"
              element={
                <LazyRoute>
                  <ArchivePanel />
                </LazyRoute>
              }
            />
          </Route>
          <Route
            path="layouts"
            element={
              <LazyRoute>
                <ExportLayoutsPanel />
              </LazyRoute>
            }
          />
          <Route element={<RequirePermission permission="editLayouts" fallback="/app/reports/layouts" />}>
            <Route
              path="layouts/new"
              element={
                <LazyRoute>
                  <ExportLayoutEditorPanel />
                </LazyRoute>
              }
            />
            <Route
              path="layouts/:id"
              element={
                <LazyRoute>
                  <ExportLayoutEditorPanel />
                </LazyRoute>
              }
            />
          </Route>
          <Route
            path=":kind"
            element={
              <LazyRoute>
                <ReportPanel />
              </LazyRoute>
            }
          />
        </Route>
        <Route element={<RequirePermission permission="vat" />}>
          <Route
            path="vat"
            element={
              <LazyRoute>
                <VatPanel />
              </LazyRoute>
            }
          />
        </Route>
        <Route element={<RequirePermission permission="audit" />}>
          <Route path="audit" element={<Annex38Panel />} />
        </Route>
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsAccountPanel />} />
          <Route element={<RequirePermission permission="companySettings" fallback="/app/settings" />}>
            <Route path="company" element={<CompanySettings />} />
            <Route path="documents" element={<DocumentSettings />} />
            <Route path="stock-rules" element={<StockRulesSettings />} />
          </Route>
          <Route path="sites" element={<SitesSettings />} />
          <Route element={<RequirePermission permission="users" fallback="/app/settings" />}>
            <Route path="users" element={<UsersSettings />} />
          </Route>
          <Route element={<RequirePermission permission="masterData" fallback="/app/settings" />}>
            <Route path="groups" element={<ProductGroupsSettings />} />
            <Route path="partners" element={<PartnersSettings />} />
            <Route path="units" element={<UnitsSettings />} />
          </Route>
          <Route element={<RequirePermission permission="audit" fallback="/app/settings" />}>
            <Route path="activity" element={<ActivityLogPanel />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={landing} />
      <Route path="*" element={landing} />
    </Routes>
  );
}
