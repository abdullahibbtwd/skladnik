import React, { useState } from 'react';
import { Boxes, Camera, Menu, X, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  onOpenDemo: () => void;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onOpenDashboard?: () => void;
  onLogout?: () => void;
  user?: { name: string; email: string; storeName: string } | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenDemo,
  onOpenLogin,
  onOpenSignup,
  onOpenDashboard,
  onLogout,
  user = null
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLinkClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="navbar">
      <div className="container">
        <div className="navbar-inner">
          {/* Brand Logo */}
          <a href="#" className="logo-group">
            <div className="logo-icon-box">
              <Boxes size={20} strokeWidth={2.4} />
            </div>
            <span>Skladnik</span>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="desktop-nav">
            <ul className="nav-links">
              <li>
                <a href="#features" className="nav-link">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="nav-link">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#compliance" className="nav-link">
                  Annex 38 Ready
                </a>
              </li>
              <li>
                <a href="#pricing" className="nav-link">
                  Pricing
                </a>
              </li>
            </ul>
          </nav>

          {/* Nav Actions (Desktop) */}
          <div className="nav-actions">
            {user ? (
              <>
                <button
                  onClick={onOpenDashboard}
                  className="btn-nav-store"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34D399',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <ShieldCheck size={16} color="#10B981" />
                  <span>{user.storeName}</span>
                </button>
                <button
                  onClick={onLogout}
                  className="btn-ghost-dark"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                >
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onOpenLogin}
                  className="btn-ghost-dark nav-login-btn"
                >
                  <span>Login</span>
                </button>
                <button
                  onClick={onOpenSignup}
                  className="btn-nav-signup"
                >
                  <span>Sign Up Free</span>
                </button>
                <button onClick={onOpenDemo} className="btn-primary nav-cta-btn">
                  <Camera size={15} strokeWidth={2.2} />
                  <span>Scan Demo</span>
                </button>
              </>
            )}

            {/* Mobile Hamburger Toggle Button */}
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <ul className="mobile-nav-links">
              <li>
                <a href="#features" className="mobile-nav-link" onClick={handleLinkClick}>
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="mobile-nav-link" onClick={handleLinkClick}>
                  How It Works
                </a>
              </li>
              <li>
                <a href="#compliance" className="mobile-nav-link" onClick={handleLinkClick}>
                  Annex 38 Ready
                </a>
              </li>
              <li>
                <a href="#pricing" className="mobile-nav-link" onClick={handleLinkClick}>
                  Pricing
                </a>
              </li>
            </ul>

            <div className="mobile-nav-actions" style={{ flexDirection: 'column', gap: '0.65rem' }}>
              {user ? (
                <>
                  <button
                    onClick={() => {
                      handleLinkClick();
                      if (onOpenDashboard) onOpenDashboard();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34D399',
                      padding: '0.65rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <ShieldCheck size={16} color="#10B981" />
                    <span>{user.storeName} (Open Dashboard)</span>
                  </button>
                  <button
                    onClick={() => {
                      handleLinkClick();
                      if (onLogout) onLogout();
                    }}
                    className="btn-ghost-dark"
                    style={{ textAlign: 'center', justifyContent: 'center' }}
                  >
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                    <button
                      onClick={() => {
                        handleLinkClick();
                        onOpenLogin();
                      }}
                      className="btn-ghost-dark mobile-login-btn"
                    >
                      <span>Login</span>
                    </button>
                    <button
                      onClick={() => {
                        handleLinkClick();
                        onOpenSignup();
                      }}
                      className="btn-nav-signup"
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <span>Sign Up Free</span>
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      handleLinkClick();
                      onOpenDemo();
                    }}
                    className="btn-primary mobile-cta-btn"
                  >
                    <Camera size={16} strokeWidth={2.2} />
                    <span>Try Scan Demo</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
