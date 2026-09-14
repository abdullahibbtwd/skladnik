import React, { useState, useEffect } from 'react';
import {
  X,
  Camera,
  ScanLine,
  CheckCircle2,
  Download,
  Zap,
  Boxes,
  FileSpreadsheet
} from 'lucide-react';
import { SampleInvoice } from './HeroSection';

const DEMO_MODAL_INVOICE: SampleInvoice = {
  id: 'dairy-modal-scan',
  name: 'Dairy & Produce Intake',
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
    }
  ]
};

interface InteractiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommitInventory?: (invoice: SampleInvoice) => void;
}

export const InteractiveModal: React.FC<InteractiveModalProps> = ({
  isOpen,
  onClose,
  onCommitInventory
}) => {
  const [scanStep, setScanStep] = useState<number>(1);
  const [progress, setProgress] = useState<number>(0);
  const [downloadedXml, setDownloadedXml] = useState<boolean>(false);

  useEffect(() => {
    setScanStep(1);
    setProgress(0);
    setDownloadedXml(false);
  }, [isOpen]);

  // Simulate scanning progress when triggered
  const handleStartScan = () => {
    setScanStep(2);
    setProgress(15);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanStep(3);
          return 100;
        }
        return prev + 25;
      });
    }, 450);
  };

  const handleDownloadXml = () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Annex38AuditLog schemaVersion="2026.1" xmlns="urn:skladnik:annex38">
  <Header>
    <GeneratedAt>2026-09-14T12:00:00Z</GeneratedAt>
    <Application>Skladnik AI OCR</Application>
    <TaxRegCode>PL5213894102</TaxRegCode>
  </Header>
  <IntakeRecord id="REC-9410">
    <Supplier>Metro Fresh Dairy Sp. z o.o.</Supplier>
    <InvoiceNo>FV/2026/09/1402</InvoiceNo>
    <LineItems>
      <Item sku="EAN-590123401" name="Fresh Milk 3.2% 1L" qty="80" fefoUrgency="4D" status="CONFIRMED"/>
      <Item sku="EAN-590123402" name="Farm Butter 200g (82%)" qty="60" fefoUrgency="14D" status="CONFIRMED"/>
      <Item sku="EAN-590123403" name="Bio Natural Yogurt 400g" qty="48" fefoUrgency="9D" status="CONFIRMED"/>
    </LineItems>
  </IntakeRecord>
</Annex38AuditLog>`;

    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skladnik_annex38_sample.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedXml(true);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              <Boxes size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#FFFFFF' }}>
                Interactive Invoice OCR Simulator
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                Experience 20s extraction &amp; live inventory reconciliation
              </div>
            </div>
          </div>

          <button onClick={onClose} className="modal-close-btn" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {scanStep === 1 && (
            <div>
              <div
                style={{
                  border: '2px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: '0.75rem',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  marginBottom: '1.5rem'
                }}
              >
                <div
                  style={{
                    width: '3.5rem',
                    height: '3.5rem',
                    borderRadius: '50%',
                    background: 'var(--sky-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                    color: 'var(--sky)'
                  }}
                >
                  <Camera size={26} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Simulate Paper Invoice Capture
                </h3>
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: '#94A3B8',
                    maxWidth: '440px',
                    margin: '0 auto 1.5rem'
                  }}
                >
                  Click the button below to test how our AI reads supplier headers, calculates line
                  taxes, and checks warehouse catalogs in under 20 seconds.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <button onClick={handleStartScan} className="btn-primary">
                    <Zap size={16} />
                    <span>Run 20s OCR Pipeline</span>
                  </button>
                </div>
              </div>

              {/* Sample Paper Preview */}
              <div
                style={{
                  background: '#0D1322',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '0.5rem',
                  padding: '1rem'
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '0.5rem'
                  }}
                >
                  Included Sample Document:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Metro Fresh Dairy Sp. z o.o.</span>
                  <span style={{ color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>FV/2026/09/1402</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                  3 line items &bull; Total: € 482.40 &bull; EANs: 590123401, 590123402, 590123403
                </div>
              </div>
            </div>
          )}

          {scanStep === 2 && (
            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
              <div
                style={{
                  width: '4rem',
                  height: '4rem',
                  borderRadius: '50%',
                  background: 'var(--sky-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  color: 'var(--sky)'
                }}
              >
                <ScanLine size={28} className="pulse-dot" />
              </div>

              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                AI Vision Processing Document...
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '1.5rem' }}>
                Detecting table borders &bull; Matching SKUs against catalog &bull; Verifying
                FEFO expirations
              </p>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '9999px',
                  height: '8px',
                  maxWidth: '400px',
                  margin: '0 auto 1rem',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    background: 'var(--sky)',
                    height: '100%',
                    width: `${progress}%`,
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: '#38BDF8'
                }}
              >
                {progress}% completed
              </span>
            </div>
          )}

          {scanStep === 3 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={18} color="#10B981" />
                  <span style={{ fontWeight: 600, color: '#6EE7B7', fontSize: '0.85rem' }}>
                    Scan Completed Successfully &bull; 3 Line Items Reconciled
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#94A3B8',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  Duration: 18.2s
                </span>
              </div>

              {/* Summary Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1.5rem'
                }}
              >
                <div
                  style={{
                    background: '#151D33',
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                    Supplier Verified
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#FFFFFF' }}>
                    Metro Fresh Dairy
                  </div>
                </div>
                <div
                  style={{
                    background: '#151D33',
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                    FEFO Urgency Alert
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#FCD34D' }}>
                    1 Item Critical (&lt; 5d)
                  </div>
                </div>
                <div
                  style={{
                    background: '#151D33',
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                    Tax Document
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#38BDF8' }}>
                    Annex 38 XML Ready
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingTop: '1rem'
                }}
              >
                <button
                  onClick={() => setScanStep(1)}
                  className="btn-ghost-dark"
                  style={{ fontSize: '0.85rem' }}
                >
                  Scan Another
                </button>
                <button
                  onClick={handleDownloadXml}
                  className="btn-ghost-dark"
                  style={{
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  {downloadedXml ? (
                    <>
                      <CheckCircle2 size={15} color="#10B981" />
                      <span>XML Downloaded</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Annex 38 XML</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (onCommitInventory) {
                      onClose();
                      onCommitInventory(DEMO_MODAL_INVOICE);
                    }
                  }}
                  className="btn-primary"
                  style={{
                    background: 'var(--emerald)',
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <FileSpreadsheet size={16} />
                  <span>Commit to Live Inventory</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
