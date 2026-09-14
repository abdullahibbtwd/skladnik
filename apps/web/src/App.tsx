import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection, SampleInvoice, SAMPLE_INVOICES } from './components/HeroSection';
import { CoreFeatures } from './components/CoreFeatures';
import { HowItWorks } from './components/HowItWorks';
import { PricingSection } from './components/PricingSection';
import { Footer } from './components/Footer';
import { InteractiveModal } from './components/InteractiveModal';
import { AuthModal } from './components/AuthModal';
import { DashboardModal } from './components/DashboardModal';

interface User {
  name: string;
  email: string;
  storeName: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [scanDemoOpen, setScanDemoOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [dashboardModalOpen, setDashboardModalOpen] = useState<boolean>(false);
  const [pendingInvoice, setPendingInvoice] = useState<SampleInvoice | null>(null);
  const [committedInvoices, setCommittedInvoices] = useState<SampleInvoice[]>([]);

  const handleOpenScanDemo = () => {
    setScanDemoOpen(true);
  };

  const handleCloseScanDemo = () => {
    setScanDemoOpen(false);
  };

  const handleOpenLogin = () => {
    setAuthMode('login');
    setAuthModalOpen(true);
  };

  const handleOpenSignup = () => {
    setAuthMode('signup');
    setAuthModalOpen(true);
  };

  const handleCloseAuthModal = () => {
    setAuthModalOpen(false);
  };

  // The Conversion Point: Commit to Live Inventory
  const handleCommitInventory = (invoice: SampleInvoice) => {
    if (user) {
      // Already logged in: commit immediately and show dashboard
      setCommittedInvoices((prev) => {
        const exists = prev.some((inv) => inv.id === invoice.id);
        return exists ? prev : [...prev, invoice];
      });
      setDashboardModalOpen(true);
    } else {
      // Visitor: Preserve invoice data and open value-oriented signup
      setPendingInvoice(invoice);
      setAuthMode('signup');
      setAuthModalOpen(true);
    }
  };

  // Auth Success: preserve pending demo invoice and transition to Dashboard
  const handleAuthSuccess = (newUser: User) => {
    setUser(newUser);
    if (pendingInvoice) {
      setCommittedInvoices((prev) => {
        const exists = prev.some((inv) => inv.id === pendingInvoice.id);
        return exists ? prev : [...prev, pendingInvoice];
      });
      setPendingInvoice(null);
    } else if (committedInvoices.length === 0) {
      // Pre-seed with default sample if signing up directly
      setCommittedInvoices([SAMPLE_INVOICES[0]]);
    }
    setAuthModalOpen(false);
    setDashboardModalOpen(true);
  };

  const handleLogout = () => {
    setUser(null);
    setDashboardModalOpen(false);
  };

  return (
    <div className="app-root">
      {/* Top Sticky Header */}
      <Navbar
        onOpenDemo={handleOpenScanDemo}
        onOpenLogin={handleOpenLogin}
        onOpenSignup={handleOpenSignup}
        onOpenDashboard={() => setDashboardModalOpen(true)}
        onLogout={handleLogout}
        user={user}
      />

      {/* Hero Section with Interactive App Preview */}
      <main>
        <HeroSection
          onOpenDemo={handleOpenScanDemo}
          onCommitInventory={handleCommitInventory}
          isCommitted={committedInvoices.length > 0}
        />

        {/* Core Features Section */}
        <CoreFeatures onOpenDemo={handleOpenScanDemo} />

        {/* How It Works 3-Step Section */}
        <HowItWorks />

        {/* Store Pricing Section */}
        <PricingSection onOpenDemo={handleOpenScanDemo} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Interactive Scan Simulator Modal */}
      <InteractiveModal
        isOpen={scanDemoOpen}
        onClose={handleCloseScanDemo}
        onCommitInventory={handleCommitInventory}
      />

      {/* Sign Up / Login Modal with Preserved Demo Result Support */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={handleCloseAuthModal}
        initialMode={authMode}
        pendingInvoice={pendingInvoice}
        onSuccess={handleAuthSuccess}
      />

      {/* Live Store Dashboard View (Post-Signup/Login) */}
      {user && (
        <DashboardModal
          isOpen={dashboardModalOpen}
          onClose={() => setDashboardModalOpen(false)}
          user={user}
          committedInvoices={committedInvoices}
          onOpenScanDemo={handleOpenScanDemo}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
