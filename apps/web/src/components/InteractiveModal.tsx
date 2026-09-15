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
import type { SampleInvoice } from './HeroSection';

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
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(30,27,75,0.45)] p-0 backdrop-blur-md sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-[840px] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white text-ops-ink shadow-[0_24px_80px_-20px_rgba(30,27,75,0.28)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-6 md:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ops-teal text-white">
              <Boxes size={16} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-[0.95rem] font-semibold text-ops-ink md:text-base">Invoice OCR simulator</div>
              <div className="font-sans text-xs text-slate-500">
                20s extraction and live inventory
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-ops-canvas hover:text-ops-ink" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 md:p-6">
          {scanStep === 1 && (
            <div>
              <div className="mb-6 rounded-xl border-2 border-dashed border-slate-200 bg-ops-canvas px-4 py-8 text-center md:px-6 md:py-10">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-ops-ai/10 text-ops-ai">
                  <Camera size={26} />
                </div>
                <h3 className="mb-2 font-display text-lg font-semibold text-ops-ink md:text-xl">Simulate paper invoice capture</h3>
                <p className="mx-auto mb-6 max-w-[440px] font-sans text-[0.9rem] text-slate-500">
                  Click the button below to test how our AI reads supplier headers, calculates line
                  taxes, and checks warehouse catalogs in under 20 seconds.
                </p>
                <div className="flex justify-center">
                  <button
                    onClick={handleStartScan}
                    className="inline-flex items-center gap-2 rounded-lg bg-ops-teal px-5 py-[0.65rem] font-display text-[0.925rem] font-medium text-white shadow-[0_4px_14px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover"
                  >
                    <Zap size={16} />
                    <span>Run 20s OCR Pipeline</span>
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-ops-canvas p-4">
                <div className="mb-2 font-display text-xs font-medium text-slate-500">Included Sample Document:</div>
                <div className="flex flex-col gap-1 text-[0.85rem] sm:flex-row sm:justify-between">
                  <span className="font-medium text-ops-ink">Metro Fresh Dairy Sp. z o.o.</span>
                  <span className="font-mono text-ops-teal">FV/2026/09/1402</span>
                </div>
                <div className="mt-1 font-sans text-xs text-slate-500">
                  3 line items &bull; Total: € 482.40 &bull; EANs: 590123401, 590123402, 590123403
                </div>
              </div>
            </div>
          )}

          {scanStep === 2 && (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-ops-ai/10 text-ops-ai">
                <ScanLine size={28} className="animate-pulse-dot" />
              </div>
              <h3 className="mb-2 font-display text-[1.15rem] font-semibold text-ops-ink">AI vision processing document...</h3>
              <p className="mb-6 font-sans text-[0.85rem] text-slate-500">
                Detecting table borders &bull; Matching SKUs against catalog &bull; Verifying FEFO expirations
              </p>
              <div className="mx-auto mb-4 h-2 max-w-[400px] overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-ops-ai transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="font-mono text-[0.8rem] text-ops-ai">{progress}% completed</span>
            </div>
          )}

          {scanStep === 3 && (
            <div>
              <div className="mb-5 flex flex-col gap-2 rounded-lg border border-ops-teal/20 bg-teal-50 px-4 py-[0.85rem] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} color="#0D9488" />
                  <span className="font-display text-[0.85rem] font-medium text-ops-teal">
                    Scan complete · 3 line items reconciled
                  </span>
                </div>
                <span className="font-mono text-xs text-slate-500">Duration: 18.2s</span>
              </div>
              <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {[
                  ['Supplier Verified', 'Metro Fresh Dairy', 'text-ops-ink'],
                  ['FEFO Urgency Alert', '1 Item Critical (< 5d)', 'text-ops-warn'],
                  ['Tax Document', 'Annex 38 XML Ready', 'text-ops-accent'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-ops-canvas p-[0.85rem]">
                    <span className="font-sans text-[0.72rem] text-slate-500">{label}</span>
                    <div className={`font-display text-[0.9rem] font-medium ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                <button
                  onClick={() => setScanStep(1)}
                  className="rounded-lg px-4 py-[0.6rem] font-display text-[0.85rem] font-medium text-slate-500 hover:bg-ops-canvas hover:text-ops-ink"
                >
                  Scan Another
                </button>
                <button
                  onClick={handleDownloadXml}
                  className="inline-flex items-center justify-center gap-[0.35rem] rounded-lg border border-slate-200 px-4 py-[0.6rem] font-display text-[0.85rem] font-medium text-ops-ink hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent"
                >
                  {downloadedXml ? (
                    <>
                      <CheckCircle2 size={15} color="#0D9488" />
                      XML Downloaded
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      Download Annex 38 XML
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ops-teal px-4 py-[0.65rem] font-display text-[0.85rem] font-medium text-white shadow-[0_4px_14px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover"
                >
                  <FileSpreadsheet size={16} />
                  Commit to Live Inventory
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
