import React, { useState, useEffect } from 'react';
import {
  X,
  Boxes,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
  Lock,
  Mail,
  Store,
  CheckCircle2
} from 'lucide-react';
import { SampleInvoice } from './HeroSection';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: 'signup' | 'login';
  pendingInvoice: SampleInvoice | null;
  onSuccess: (user: { name: string; email: string; storeName: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode,
  pendingInvoice,
  onSuccess
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [storeName, setStoreName] = useState('Metro Corner Market');
  const [email, setEmail] = useState('manager@metrofresh.com');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSuccess({
        name: storeName.trim() || 'My Retail Store',
        email: email.trim() || 'store@skladnik.app',
        storeName: storeName.trim() || 'My Retail Store'
      });
    }, 450);
  };

  const totalPcs = pendingInvoice
    ? pendingInvoice.items.reduce((sum, item) => sum + item.qty, 0)
    : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog auth-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="logo-icon-box" style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem' }}>
              <Boxes size={16} strokeWidth={2.4} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF' }}>Skladnik</span>
          </div>

          <button onClick={onClose} className="modal-close-btn" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '1.75rem 1.5rem' }}>
          {/* Headline & Value Subtitle */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            {mode === 'signup' ? (
              pendingInvoice ? (
                <>
                  <h2
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      lineHeight: 1.25,
                      marginBottom: '0.45rem',
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Save this inventory to your store
                  </h2>
                  <p style={{ fontSize: '0.88rem', color: '#94A3B8' }}>
                    Create your free account to continue.
                  </p>
                </>
              ) : (
                <>
                  <h2
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      lineHeight: 1.25,
                      marginBottom: '0.45rem',
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Create your free account
                  </h2>
                  <p style={{ fontSize: '0.88rem', color: '#94A3B8' }}>
                    Digitize paper invoices and automate stock in seconds.
                  </p>
                </>
              )
            ) : (
              <>
                <h2
                  style={{
                    fontSize: '1.45rem',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    lineHeight: 1.25,
                    marginBottom: '0.45rem',
                    letterSpacing: '-0.02em'
                  }}
                >
                  Log in to your store
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#94A3B8' }}>
                  Access your live inventory and Annex 38 tax audits.
                </p>
              </>
            )}
          </div>

          {/* Preserved Demo Result Callout Card */}
          {mode === 'signup' && pendingInvoice && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '0.65rem',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.35rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileSpreadsheet size={15} color="#10B981" />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34D399' }}>
                    Scanned Demo Invoice Preserved
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#10B981',
                    background: 'rgba(16, 185, 129, 0.15)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}
                >
                  {pendingInvoice.total}
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#F1F5F9', fontWeight: 600 }}>
                {pendingInvoice.supplier} &bull; Inv: {pendingInvoice.invNumber}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.72rem',
                  color: '#94A3B8',
                  marginTop: '0.35rem'
                }}
              >
                <CheckCircle2 size={13} color="#10B981" />
                <span>
                  <strong>{pendingInvoice.items.length} lines ({totalPcs} units)</strong> will be instantly imported into your dashboard.
                </span>
              </div>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="storeName"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '0.35rem'
                  }}
                >
                  Store or Business Name
                </label>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '0.85rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#64748B'
                    }}
                  >
                    <Store size={16} />
                  </div>
                  <input
                    id="storeName"
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="e.g. Metro Corner Grocery"
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.85rem 0.7rem 2.5rem',
                      background: '#0D1322',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '0.5rem',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#94A3B8',
                  marginBottom: '0.35rem'
                }}
              >
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748B'
                  }}
                >
                  <Mail size={16} />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@store.com"
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem 0.7rem 2.5rem',
                    background: '#0D1322',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '0.5rem',
                    color: '#FFFFFF',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#94A3B8',
                  marginBottom: '0.35rem'
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748B'
                  }}
                >
                  <Lock size={16} />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem 0.7rem 2.5rem',
                    background: '#0D1322',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '0.5rem',
                    color: '#FFFFFF',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '0.75rem 1.25rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                background: mode === 'signup' && pendingInvoice ? 'var(--emerald)' : 'var(--sky)'
              }}
            >
              {loading ? (
                <span>Configuring Store Ledger...</span>
              ) : mode === 'signup' ? (
                pendingInvoice ? (
                  <>
                    <FileSpreadsheet size={16} />
                    <span>Save Inventory &amp; Open Store</span>
                  </>
                ) : (
                  <>
                    <ArrowRight size={16} />
                    <span>Create Free Store Account</span>
                  </>
                )
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Log In to Dashboard</span>
                </>
              )}
            </button>
          </form>

          {/* Toggle between Signup and Login */}
          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
              fontSize: '0.82rem',
              color: '#94A3B8'
            }}
          >
            {mode === 'signup' ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  style={{
                    color: '#38BDF8',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Log In
                </button>
              </span>
            ) : (
              <span>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  style={{
                    color: '#38BDF8',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Sign Up Free
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
