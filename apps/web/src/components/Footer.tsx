import React from 'react';
import { Boxes, ShieldCheck, FileCheck2 } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          {/* Brand Col */}
          <div>
            <div className="footer-brand-title">
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '0.5rem',
                  background: 'var(--sky)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF'
                }}
              >
                <Boxes size={18} />
              </div>
              <span>Skladnik</span>
            </div>
            <p className="footer-brand-desc">
              AI-driven retail inventory management. Transforming paper vendor invoices into
              accurate live stock, FEFO expiry schedules, and compliant Annex 38 tax audits.
            </p>
            <div className="system-status-indicator">
              <span className="pulse-dot" />
              <span>All Systems Operational &bull; Annex 38 Ready</span>
            </div>
          </div>

          {/* Column 1: Core Platform */}
          <div>
            <h4 className="footer-col-title">Platform</h4>
            <ul className="footer-link-list">
              <li>
                <a href="#features">Snap & Stock OCR</a>
              </li>
              <li>
                <a href="#features">FEFO Expiry Board</a>
              </li>
              <li>
                <a href="#compliance">Annex No. 38 Ready</a>
              </li>
              <li>
                <a href="#features">Mobile Quick Scan</a>
              </li>
              <li>
                <a href="#pricing">Store Pricing Plans</a>
              </li>
            </ul>
          </div>

          {/* Column 2: Compliance & Trust */}
          <div>
            <h4 className="footer-col-title">Compliance</h4>
            <ul className="footer-link-list">
              <li>
                <a href="#compliance" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>Annex No. 38 XML</span>
                  <FileCheck2 size={13} color="#10B981" />
                </a>
              </li>
              <li>
                <a href="#">Tax Audit Specifications</a>
              </li>
              <li>
                <a href="#">Food Expiry Safety (HACCP)</a>
              </li>
              <li>
                <a href="#">Data Encryption Standard</a>
              </li>
              <li>
                <a href="#">Privacy Policy</a>
              </li>
            </ul>
          </div>

          {/* Column 3: Store Hardware */}
          <div>
            <h4 className="footer-col-title">Compatibility</h4>
            <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5, marginBottom: '0.85rem' }}>
              Compatible with iOS, Android, macOS, Windows, and standard receipt printers.
            </p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                color: '#CBD5E1',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '0.4rem 0.65rem',
                borderRadius: '0.375rem',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <ShieldCheck size={14} color="#10B981" />
              <span>EU Retail Compliance Verified</span>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div>
            &copy; {new Date().getFullYear()} Skladnik Technologies. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="#">Terms of Service</a>
            <a href="#">Security Overview</a>
            <a href="#">System Status</a>
            <a href="#">Support Portal</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
