import React from 'react';
import {
  Camera,
  CalendarClock,
  FileCode2,
  MonitorSmartphone,
  CheckCircle2,
  Download,
  AlertCircle,
  TrendingDown,
  Layers,
  ArrowRight
} from 'lucide-react';

interface CoreFeaturesProps {
  onOpenDemo: () => void;
}

export const CoreFeatures: React.FC<CoreFeaturesProps> = ({ onOpenDemo }) => {
  return (
    <section id="features" className="features-section">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-badge">
            <Layers size={14} />
            <span>Core Capabilities</span>
          </div>
          <h2 className="section-title">Engineered for Busy Store Fronts & Back Rooms</h2>
          <p className="section-desc">
            No more hours spent keying delivery notes into spreadsheets. Skladnik replaces
            manual data entry with smart vision, proactive waste management, and tax readiness.
          </p>
        </div>

        {/* 2x2 High-Impact Feature Grid */}
        <div className="features-grid">
          {/* Feature 1: Snap & Stock */}
          <div className="feature-card">
            <div>
              <div className="feature-top">
                <div
                  className="feature-icon-container"
                  style={{
                    background: 'rgba(14, 165, 233, 0.12)',
                    color: '#0EA5E9',
                    border: '1px solid rgba(14, 165, 233, 0.25)'
                  }}
                >
                  <Camera size={26} strokeWidth={2.2} />
                </div>
                <span className="tag-feature tag-feature-sky">Snap & Stock</span>
              </div>

              <h3 className="feature-title">Instant OCR Document Processing</h3>
              <p className="feature-body">
                Hold your smartphone or tablet over any delivery slip or vendor invoice. Our
                specialized retail model detects SKU codes, descriptions, quantities, and prices
                in under 20 seconds.
              </p>
            </div>

            {/* Visual Micro-Demo inside card */}
            <div className="feature-visual-demo">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 size={14} color="#10B981" />
                  <span>Auto-Aligned Document</span>
                </span>
                <span style={{ color: '#0EA5E9', fontFamily: 'var(--font-mono)' }}>
                  99.4% OCR Confidence
                </span>
              </div>
              <div
                style={{
                  background: '#FFFFFF',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.8rem' }}>
                    Artisan Sourdough Loaf 750g
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                    EAN: 590882110 &bull; 25 units detected
                  </div>
                </div>
                <button
                  onClick={onOpenDemo}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    background: '#F1F5F9',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: '#0EA5E9'
                  }}
                >
                  <span>Test OCR</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Feature 2: FEFO Expiry Board */}
          <div className="feature-card">
            <div>
              <div className="feature-top">
                <div
                  className="feature-icon-container"
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#10B981',
                    border: '1px solid rgba(16, 185, 129, 0.25)'
                  }}
                >
                  <CalendarClock size={26} strokeWidth={2.2} />
                </div>
                <span className="tag-feature tag-feature-emerald">Waste Prevention</span>
              </div>

              <h3 className="feature-title">FEFO Expiry Board</h3>
              <p className="feature-body">
                Stop throwing spoiled goods into the trash. The First-Expired, First-Out engine
                calculates sell-by urgency and suggests timely promotions before items reach
                expiration.
              </p>
            </div>

            {/* Visual Micro-Demo */}
            <div className="feature-visual-demo">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertCircle size={14} color="#F59E0B" />
                  <span>Expiring Within 48 Hours</span>
                </span>
                <span
                  style={{
                    color: '#10B981',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem'
                  }}
                >
                  <TrendingDown size={14} />
                  <span>-38% Shrinkage</span>
                </span>
              </div>
              <div
                style={{
                  background: '#FFFFFF',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.8rem' }}>
                    Fresh Milk 3.2% (Batch #941)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 600 }}>
                    Expires in 2 days &bull; Recommended: 30% Flash Sale
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#EF4444',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.25rem'
                  }}
                >
                  Priority Shelf
                </span>
              </div>
            </div>
          </div>

          {/* Feature 3: Annex No. 38 Ready */}
          <div id="compliance" className="feature-card">
            <div>
              <div className="feature-top">
                <div
                  className="feature-icon-container"
                  style={{
                    background: 'rgba(139, 92, 246, 0.12)',
                    color: '#8B5CF6',
                    border: '1px solid rgba(139, 92, 246, 0.25)'
                  }}
                >
                  <FileCode2 size={26} strokeWidth={2.2} />
                </div>
                <span className="tag-feature tag-feature-violet">Compliance & Tax</span>
              </div>

              <h3 className="feature-title">Annex No. 38 Ready</h3>
              <p className="feature-body">
                Avoid fiscal audit nightmares. Skladnik continuously formats every supplier
                intake, receipt, and stock movement into standardized Annex No. 38 XML files
                ready for tax authorities.
              </p>
            </div>

            {/* Visual Micro-Demo */}
            <div className="feature-visual-demo">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569'
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  annex38_stock_register_2026.xml
                </span>
                <span
                  style={{
                    color: '#10B981',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '0.2rem'
                  }}
                >
                  Validated Schema
                </span>
              </div>
              <div
                style={{
                  background: '#090D16',
                  color: '#94A3B8',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}
              >
                <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                  &lt;StockRecord type=&quot;INVOICE_OCR&quot; taxStatus=&quot;COMPLIANT&quot;&gt;
                </code>
                <button
                  onClick={onOpenDemo}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    color: '#38BDF8',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    flexShrink: 0
                  }}
                >
                  <Download size={13} />
                  <span>Download XML</span>
                </button>
              </div>
            </div>
          </div>

          {/* Feature 4: Works Anywhere */}
          <div className="feature-card">
            <div>
              <div className="feature-top">
                <div
                  className="feature-icon-container"
                  style={{
                    background: 'rgba(14, 165, 233, 0.12)',
                    color: '#0EA5E9',
                    border: '1px solid rgba(14, 165, 233, 0.25)'
                  }}
                >
                  <MonitorSmartphone size={26} strokeWidth={2.2} />
                </div>
                <span className="tag-feature tag-feature-sky">Universal Access</span>
              </div>

              <h3 className="feature-title">Works Anywhere</h3>
              <p className="feature-body">
                No expensive proprietary barcode guns or bulky Windows 7 POS terminals.
                Access your store inventory from any smartphone camera, iPad on the counter,
                or laptop back at home.
              </p>
            </div>

            {/* Visual Micro-Demo */}
            <div className="feature-visual-demo">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569',
                  flexWrap: 'wrap',
                  gap: '0.35rem'
                }}
              >
                <span>Synced Devices (Store #01)</span>
                <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Layers size={13} />
                  <span>Live WebSocket</span>
                </span>
              </div>
              <div
                style={{
                  background: '#FFFFFF',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  fontSize: '0.72rem',
                  color: '#0F172A',
                  fontWeight: 600
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={13} color="#10B981" />
                  <span>Staff Phone (Scan)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={13} color="#10B981" />
                  <span>Tablet Register</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={13} color="#10B981" />
                  <span>Owner Web Dashboard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
