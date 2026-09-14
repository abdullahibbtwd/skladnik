import React, { useState } from 'react';
import {
  Camera,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ScanLine,
  FileCheck2,
  Zap,
  RefreshCw,
  FileSpreadsheet,
  ShieldCheck,
  MonitorSmartphone,
  ArrowRight,
  Boxes
} from 'lucide-react';

export interface SampleInvoice {
  id: string;
  name: string;
  supplier: string;
  invNumber: string;
  date: string;
  taxId: string;
  total: string;
  items: {
    sku: string;
    description: string;
    qty: number;
    unitPrice: string;
    fefoStatus: 'urgent' | 'warning' | 'safe';
    fefoLabel: string;
  }[];
}

export const SAMPLE_INVOICES: SampleInvoice[] = [
  {
    id: 'dairy',
    name: 'Dairy & Produce',
    supplier: 'Metro Fresh Dairy Sp. z o.o.',
    invNumber: 'FV/2026/09/1402',
    date: '14-09-2026',
    taxId: 'PL5213894102',
    total: '€ 482.40',
    items: [
      {
        sku: 'EAN-590123401',
        description: 'Fresh Milk 3.2% 1L',
        qty: 80,
        unitPrice: '€ 1.15',
        fefoStatus: 'urgent',
        fefoLabel: 'Urgent (4d)'
      },
      {
        sku: 'EAN-590123402',
        description: 'Farm Butter 200g (82%)',
        qty: 60,
        unitPrice: '€ 1.95',
        fefoStatus: 'warning',
        fefoLabel: 'Notice (14d)'
      },
      {
        sku: 'EAN-590123403',
        description: 'Bio Natural Yogurt 400g',
        qty: 48,
        unitPrice: '€ 0.85',
        fefoStatus: 'warning',
        fefoLabel: 'Notice (9d)'
      },
      {
        sku: 'EAN-590123404',
        description: 'Aged Cheddar Block 2.5kg',
        qty: 6,
        unitPrice: '€ 24.50',
        fefoStatus: 'safe',
        fefoLabel: 'Safe (92d)'
      }
    ]
  },
  {
    id: 'bakery',
    name: 'Artisan Bakery',
    supplier: 'Golden Grain Bakery Wholesale',
    invNumber: 'GGB-8842-26',
    date: '14-09-2026',
    taxId: 'PL7749102450',
    total: '€ 312.90',
    items: [
      {
        sku: 'EAN-590882109',
        description: 'Butter Croissants (Box 40)',
        qty: 3,
        unitPrice: '€ 32.00',
        fefoStatus: 'urgent',
        fefoLabel: 'Urgent (2d)'
      },
      {
        sku: 'EAN-590882110',
        description: 'Artisan Sourdough Loaf 750g',
        qty: 25,
        unitPrice: '€ 2.40',
        fefoStatus: 'urgent',
        fefoLabel: 'Urgent (3d)'
      },
      {
        sku: 'EAN-590882115',
        description: 'Fine Wheat Flour Type 500',
        qty: 8,
        unitPrice: '€ 19.50',
        fefoStatus: 'safe',
        fefoLabel: 'Safe (180d)'
      }
    ]
  },
  {
    id: 'beverages',
    name: 'Beverage Wholesale',
    supplier: 'Vanguard Beverage Distribution',
    invNumber: 'INV-BEV-9931',
    date: '13-09-2026',
    taxId: 'PL6762391084',
    total: '€ 684.00',
    items: [
      {
        sku: 'EAN-590442301',
        description: 'Spring Water 500ml (24pk)',
        qty: 15,
        unitPrice: '€ 8.40',
        fefoStatus: 'safe',
        fefoLabel: 'Safe (365d)'
      },
      {
        sku: 'EAN-590442308',
        description: 'Fresh Pressed Cold Orange 1L',
        qty: 36,
        unitPrice: '€ 2.65',
        fefoStatus: 'urgent',
        fefoLabel: 'Urgent (7d)'
      },
      {
        sku: 'EAN-590442319',
        description: 'Nitro Cold Brew Coffee 250ml',
        qty: 48,
        unitPrice: '€ 1.70',
        fefoStatus: 'safe',
        fefoLabel: 'Safe (118d)'
      }
    ]
  }
];

interface HeroSectionProps {
  onOpenDemo: () => void;
  onCommitInventory: (invoice: SampleInvoice) => void;
  isCommitted?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenDemo,
  onCommitInventory,
  isCommitted = false
}) => {
  const [selectedSample, setSelectedSample] = useState<SampleInvoice>(SAMPLE_INVOICES[0]);
  const [isRescanning, setIsRescanning] = useState(false);

  const handleRescan = () => {
    setIsRescanning(true);
    setTimeout(() => {
      setIsRescanning(false);
    }, 600);
  };

  const handleCommit = () => {
    onCommitInventory(selectedSample);
  };

  return (
    <section className="hero-fullscreen">
      <div className="container-hero">
        <div className="hero-2col-layout">
          {/* LEFT COLUMN: Sales Pitch & Trust Proof */}
          <div className="hero-pitch-column">
            {/* Clean Professional Category Badge */}
            <div className="hero-category-pill">
              <Boxes size={15} className="hero-category-icon" />
              <span>Smart Retail &amp; Stock Management</span>
            </div>

            {/* High-Impact Headline */}
            <h1 className="hero-main-title">
              Snap an Invoice.
              <br />
              Control Expiry.
              <br />
              <span className="hero-title-highlight">Run Your Store.</span>
            </h1>

            {/* Subtitle */}
            <p className="hero-lead-text">
              Turn paper invoices into live stock in under 20 seconds. Built for
              neighbourhood grocery stores, cafés, and retail outlets.
            </p>

            {/* Action Buttons - Single Impactful Primary CTA */}
            <div className="hero-button-row">
              <button onClick={onOpenDemo} className="btn-hero-primary-clean">
                <Camera size={18} strokeWidth={2.2} />
                <span>Try Invoice Scan Demo</span>
              </button>
            </div>

            {/* Integrated Trust & Proof Badges */}
            <div className="hero-trust-bar">
              <div className="hero-trust-item">
                <div className="trust-mini-icon sky">
                  <Zap size={14} />
                </div>
                <div>
                  <span className="trust-strong">20s OCR Speed</span>
                  <span className="trust-sub">Instant paper intake</span>
                </div>
              </div>

              <div className="hero-trust-item">
                <div className="trust-mini-icon emerald">
                  <ShieldCheck size={14} />
                </div>
                <div>
                  <span className="trust-strong">0% Manual Errors</span>
                  <span className="trust-sub">Auto catalog match</span>
                </div>
              </div>

              <div className="hero-trust-item">
                <div className="trust-mini-icon slate">
                  <FileCheck2 size={14} />
                </div>
                <div>
                  <span className="trust-strong">Annex 38 Ready</span>
                  <span className="trust-sub">Tax audit compliant</span>
                </div>
              </div>

              <div className="hero-trust-item">
                <div className="trust-mini-icon sky">
                  <MonitorSmartphone size={14} />
                </div>
                <div>
                  <span className="trust-strong">Works Anywhere</span>
                  <span className="trust-sub">Mobile &amp; counter POS</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: The Interactive App Preview */}
          <div className="hero-preview-column">
            <div className="preview-card-shell">
              {/* Window Header */}
              <div className="preview-card-header">
                <div className="preview-session-info">
                  <span className="live-status-dot" />
                  <span className="preview-engine-tag">skladnik-ocr-engine v2.4 (Active Session)</span>
                </div>

                <div className="preview-sample-tabs">
                  <span className="sample-label">Sample Invoice:</span>
                  {SAMPLE_INVOICES.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => {
                        setSelectedSample(sample);
                        setStockCommitted(false);
                      }}
                      className={`sample-tab-btn ${selectedSample.id === sample.id ? 'active' : ''}`}
                    >
                      {sample.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Interactive Body */}
              <div className="preview-split-body">
                {/* Left Side: Clean Thermal Paper Receipt */}
                <div className="preview-paper-side">
                  <div className="paper-top-action">
                    <div className="paper-source-tag">
                      <Camera size={13} />
                      <span>Scanned Camera Frame</span>
                    </div>
                    <button onClick={handleRescan} className="paper-rescan-btn">
                      <RefreshCw size={12} className={isRescanning ? 'spin-icon' : ''} />
                      <span>Rescan</span>
                    </button>
                  </div>

                  {/* Physical Paper Document */}
                  <div className="receipt-paper">
                    {/* Subtle clean sky blue laser scanning beam */}
                    <div className="clean-scan-beam" />

                    {/* Paper Document Header */}
                    <div className="receipt-header">
                      <div className="receipt-supplier-name">{selectedSample.supplier}</div>
                      <div className="receipt-meta-clean">
                        <span>Inv: <strong>{selectedSample.invNumber}</strong></span>
                        <span>Date: <strong>{selectedSample.date}</strong></span>
                        <span>VAT: <strong>{selectedSample.taxId}</strong></span>
                        <span className="receipt-tax-verified">TAX VERIFIED</span>
                      </div>
                    </div>

                    {/* Paper Table */}
                    <div className="receipt-table-wrap">
                      <table className="receipt-table">
                        <thead>
                          <tr>
                            <th style={{ width: '60%' }}>Item / Description</th>
                            <th style={{ width: '18%', textAlign: 'center' }}>Qty</th>
                            <th style={{ width: '22%', textAlign: 'right' }}>Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSample.items.map((item, idx) => (
                            <tr key={idx}>
                              <td>
                                <div className="receipt-item-title">{item.description}</div>
                                <div className="receipt-item-sku">SKU: {item.sku}</div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="receipt-qty-tag">{item.qty}x</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="receipt-price-val">{item.unitPrice}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paper Footer */}
                    <div className="receipt-footer">
                      <span className="receipt-total-label">Gross Invoice Total:</span>
                      <span className="receipt-total-value">{selectedSample.total}</span>
                    </div>

                    <div className="receipt-status-line">
                      <ScanLine size={12} color="#0EA5E9" />
                      <span>OCR Bounding Boxes: 100% Detected</span>
                    </div>
                  </div>
                </div>

                {/* Center Pipeline Divider */}
                <div className="preview-pipeline-divider">
                  <div className="pipeline-arrow-badge">
                    <ArrowRight size={13} />
                  </div>
                  <span className="pipeline-text">20s AI Pipeline</span>
                </div>

                {/* Right Side: Structured AI Stock Data */}
                <div className="preview-data-side">
                  {/* Status Pills */}
                  <div className="data-side-header">
                    <div className="data-badges-left">
                      <span className="badge-pill-reader">
                        <ScanLine size={12} />
                        <span>AI Camera Reader: Active</span>
                      </span>
                      <span className="badge-pill-annex">
                        <FileCheck2 size={12} />
                        <span>Annex 38 Ready</span>
                      </span>
                    </div>
                    <span className="speed-stat-tag">
                      <Zap size={12} />
                      <span>Processed in 18.4s</span>
                    </span>
                  </div>

                  {/* Clean Structured Data Table */}
                  <div className="structured-table-container">
                    <table className="clean-data-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40%' }}>Item &amp; Code</th>
                          <th style={{ width: '18%', textAlign: 'right' }}>Stock Qty</th>
                          <th style={{ width: '23%', textAlign: 'center' }}>FEFO Expiry</th>
                          <th style={{ width: '19%', textAlign: 'right' }}>Audit Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSample.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <div className="data-item-name">{item.description}</div>
                              <div className="data-item-code">{item.sku}</div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="data-qty-num">+{item.qty} units</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className={`fefo-pill ${
                                  item.fefoStatus === 'urgent'
                                    ? 'fefo-pill-urgent'
                                    : item.fefoStatus === 'warning'
                                    ? 'fefo-pill-warning'
                                    : 'fefo-pill-safe'
                                }`}
                              >
                                {item.fefoStatus === 'urgent' ? (
                                  <AlertTriangle size={11} />
                                ) : (
                                  <Clock size={11} />
                                )}
                                <span>{item.fefoLabel}</span>
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="confirmed-stock-pill">
                                <CheckCircle2 size={11} />
                                <span>Confirmed</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom Summary Bar */}
                  <div className="data-side-footer">
                    <div className="summary-group">
                      <div className="summary-stat-cell">
                        <span className="stat-label">Verified Items</span>
                        <span className="stat-number">{selectedSample.items.length} lines</span>
                      </div>
                      <div className="summary-stat-cell">
                        <span className="stat-label">Total Volume</span>
                        <span className="stat-number">
                          {selectedSample.items.reduce((acc, curr) => acc + curr.qty, 0)} pcs
                        </span>
                      </div>
                      <div className="summary-stat-cell">
                        <span className="stat-label">Tax Total</span>
                        <span className="stat-number highlight-sky">{selectedSample.total}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleCommit}
                      className={`btn-commit-clean ${isCommitted ? 'committed' : ''}`}
                    >
                      {isCommitted ? (
                        <>
                          <CheckCircle2 size={14} />
                          <span>Inventory Saved</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet size={14} />
                          <span>Commit to Live Inventory</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
