import React, { useState } from 'react';
import {
  Camera,
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
import { cn, fefoPillClass } from '../lib/cn';

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
  isCommitted = false,
}) => {
  const [selectedSample, setSelectedSample] = useState<SampleInvoice>(SAMPLE_INVOICES[0]);
  const [isRescanning, setIsRescanning] = useState(false);

  const handleRescan = () => {
    setIsRescanning(true);
    setTimeout(() => setIsRescanning(false), 600);
  };

  return (
    <section className="relative flex w-full items-center justify-center overflow-x-hidden bg-ops-canvas py-8 text-ops-ink md:min-h-[calc(100vh-4.5rem)] md:py-14">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-8rem] left-1/4 size-[28rem] rounded-full bg-ops-accent/[0.07] blur-[120px]" />
        <div className="absolute right-0 bottom-0 size-[22rem] rounded-full bg-ops-teal/[0.08] blur-[110px]" />
      </div>
      <div className="relative mx-auto w-full max-w-[1240px] px-4 md:px-6">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-11">
          <div className="flex w-full min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-[0.3rem] font-display text-[0.72rem] font-medium text-slate-500 md:text-[0.78rem]">
              <Boxes size={14} className="shrink-0 text-ops-teal" />
              <span className="truncate">Retail stock, from paper invoices</span>
            </div>

            <h1 className="mb-4 font-display text-[1.85rem] leading-[1.18] font-semibold tracking-tight text-ops-ink sm:text-[2.2rem] md:mb-[1.15rem] md:text-[3rem] md:leading-[1.12]">
              Snap an Invoice.
              <br />
              Control Expiry.
              <br />
              <span className="inline-block font-semibold text-ops-teal">Run Your Store.</span>
            </h1>

            <p className="mb-6 max-w-[520px] px-1 font-sans text-[0.95rem] leading-relaxed text-slate-500 md:mb-8 md:text-[1.05rem]">
              Turn paper invoices into live stock in under 20 seconds. Built for
              neighbourhood grocery stores, cafés, and retail outlets.
            </p>

            <div className="mb-7 flex w-full max-w-[520px] flex-wrap items-center justify-center gap-3 lg:mb-9 lg:max-w-none lg:justify-start">
              <button
                onClick={onOpenDemo}
                className="inline-flex w-full items-center justify-center gap-[0.65rem] rounded-[0.55rem] bg-ops-teal px-5 py-[0.75rem] font-display text-[0.92rem] font-medium text-white shadow-[0_4px_14px_rgba(13,148,136,0.28)] transition-all hover:bg-ops-teal-hover sm:w-auto sm:px-[1.45rem]"
              >
                <Camera size={17} strokeWidth={2} />
                <span>Try Invoice Scan Demo</span>
              </button>
            </div>

            <div className="grid w-full max-w-[520px] grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-200 pt-6 md:gap-x-7 md:gap-y-5 md:pt-[1.85rem] lg:max-w-none">
              {[
                { icon: Zap, title: '20s OCR Speed', sub: 'Instant paper intake', tone: 'teal' },
                { icon: ShieldCheck, title: '0% Manual Errors', sub: 'Auto catalog match', tone: 'indigo' },
                { icon: FileCheck2, title: 'Annex 38 Ready', sub: 'Tax audit compliant', tone: 'warn' },
                { icon: MonitorSmartphone, title: 'Works Anywhere', sub: 'Mobile & counter POS', tone: 'teal' },
              ].map((item) => (
                <div key={item.title} className="flex min-w-0 items-start gap-2.5 md:items-center md:gap-3">
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border md:size-9',
                      item.tone === 'teal' && 'border-ops-teal/20 bg-teal-50 text-ops-teal',
                      item.tone === 'indigo' && 'border-ops-accent/20 bg-indigo-50 text-ops-accent',
                      item.tone === 'warn' && 'border-ops-ai/20 bg-purple-50 text-ops-ai',
                    )}
                  >
                    <item.icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-display text-[0.78rem] leading-snug font-medium text-ops-ink md:text-[0.88rem]">{item.title}</span>
                    <span className="block font-sans text-[0.7rem] leading-snug text-slate-500">{item.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full min-w-0">
            <div className="w-full min-w-0 overflow-hidden rounded-[0.85rem] border border-slate-200 bg-white shadow-[0_16px_40px_-12px_rgba(30,27,75,0.14)]">
              <div className="flex flex-col gap-2 border-b border-slate-100 bg-ops-canvas px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:px-[1.15rem]">
                <div className="flex items-center gap-[0.55rem]">
                  <span className="size-[0.55rem] rounded-full bg-ops-teal shadow-[0_0_8px_#0d9488]" />
                  <span className="font-mono text-[0.68rem] font-medium text-slate-500 md:text-xs">
                    OCR engine <span className="hidden sm:inline">v2.4 · Active</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="hidden shrink-0 font-display text-[0.72rem] font-medium text-slate-500 sm:inline">Sample:</span>
                  {SAMPLE_INVOICES.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => setSelectedSample(sample)}
                      className={cn(
                        'shrink-0 rounded-[0.35rem] border px-2.5 py-[0.28rem] font-display text-[0.7rem] font-medium transition-all md:px-[0.6rem] md:text-[0.72rem]',
                        selectedSample.id === sample.id
                          ? 'border-ops-teal bg-ops-teal text-white'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-ops-accent/30 hover:text-ops-ink',
                      )}
                    >
                      {sample.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid w-full grid-cols-1 bg-white lg:min-h-[440px] lg:grid-cols-[minmax(0,1fr)_44px_minmax(0,1.35fr)]">
                <div className="flex min-w-0 flex-col overflow-hidden border-slate-100 bg-ops-canvas/50 p-3 md:p-[1.05rem] lg:border-r">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-[0.35rem] font-display text-[0.72rem] font-medium tracking-wide text-ops-ai uppercase">
                      <Camera size={13} />
                      <span>Scanned Camera Frame</span>
                    </div>
                    <button
                      onClick={handleRescan}
                      className="inline-flex items-center gap-[0.3rem] rounded bg-white px-[0.45rem] py-[0.2rem] font-display text-[0.7rem] text-slate-500 transition-all hover:text-ops-ink"
                    >
                      <RefreshCw size={12} className={isRescanning ? 'animate-spin' : ''} />
                      <span>Rescan</span>
                    </button>
                  </div>

                  <div className="relative flex min-w-0 flex-1 flex-col justify-between overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[0.72rem] text-ops-ink shadow-[0_8px_20px_-10px_rgba(30,27,75,0.12)] md:p-[1.05rem] md:text-[0.74rem]">
                    <div className="animate-scan-beam absolute inset-x-0 top-0 z-10 h-0.5 bg-ops-ai opacity-85 shadow-[0_0_8px_#9333ea]" />
                    <div>
                      <div className="mb-[0.55rem] border-b-[1.5px] border-dashed border-slate-300 pb-[0.55rem]">
                        <div className="mb-1 font-sans text-[0.8rem] font-semibold text-slate-900">{selectedSample.supplier}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-slate-500">
                          <span>
                            Inv: <strong className="font-mono text-slate-800">{selectedSample.invNumber}</strong>
                          </span>
                          <span>
                            Date: <strong className="font-mono">{selectedSample.date}</strong>
                          </span>
                          <span>
                            VAT: <strong className="font-mono">{selectedSample.taxId}</strong>
                          </span>
                          <span className="font-display text-[0.62rem] font-medium tracking-wide text-ops-teal uppercase">Tax verified</span>
                        </div>
                      </div>
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="text-[0.62rem] tracking-wide text-slate-500 uppercase">
                            <th className="w-[60%] pb-1 font-semibold">Item / Description</th>
                            <th className="w-[18%] pb-1 text-center font-semibold">Qty</th>
                            <th className="w-[22%] pb-1 text-right font-semibold">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSample.items.map((item) => (
                            <tr key={item.sku} className="border-t border-slate-100">
                              <td className="py-1.5">
                                <div className="font-sans text-[0.72rem] font-medium text-slate-900">{item.description}</div>
                                <div className="font-mono text-[0.62rem] text-slate-500">SKU: {item.sku}</div>
                              </td>
                              <td className="text-center">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.68rem] font-medium">{item.qty}x</span>
                              </td>
                              <td className="text-right font-mono text-[0.72rem] font-medium">{item.unitPrice}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                        <span className="font-sans text-[0.7rem] font-medium text-slate-500">Gross Invoice Total:</span>
                        <span className="font-mono text-sm font-semibold text-slate-900">{selectedSample.total}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[0.65rem] text-slate-500">
                        <ScanLine size={12} color="#9333EA" />
                        <span>OCR Bounding Boxes: 100% Detected</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 px-4 py-2 lg:hidden">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="font-mono text-[0.62rem] tracking-wider text-slate-400">20s pipeline</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="hidden flex-col items-center justify-center gap-3 overflow-hidden lg:flex">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ops-teal text-white">
                    <ArrowRight size={13} />
                  </div>
                  <span className="font-mono text-[0.58rem] tracking-wider text-slate-400 uppercase [writing-mode:vertical-rl]">20s pipeline</span>
                </div>

                <div className="flex min-w-0 flex-col p-3 md:p-[1.05rem]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-ops-ai/20 bg-purple-50 px-2 py-0.5 font-display text-[0.65rem] font-medium text-ops-ai">
                        <ScanLine size={12} />
                        Camera reader
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-ops-teal/20 bg-teal-50 px-2 py-0.5 font-display text-[0.65rem] font-medium text-ops-teal">
                        <FileCheck2 size={12} />
                        Annex 38
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-slate-400">
                      <Zap size={12} />
                      18.4s
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-2 lg:hidden">
                    {selectedSample.items.map((item) => (
                      <div key={item.sku} className="rounded-lg border border-slate-200 bg-ops-canvas px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-geist text-[0.78rem] font-medium text-ops-ink">{item.description}</div>
                            <div className="font-mono text-[0.62rem] text-slate-500">{item.sku}</div>
                          </div>
                          <span className="shrink-0 font-mono text-[0.72rem] font-medium text-ops-teal">+{item.qty}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className={fefoPillClass(item.fefoStatus)}>
                            {item.fefoStatus === 'urgent' ? <AlertTriangle size={11} /> : <Clock size={11} />}
                            <span>{item.fefoLabel}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-[0.65rem] font-medium text-ops-teal">
                            <CheckCircle2 size={11} />
                            Confirmed
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden min-w-0 flex-1 overflow-x-auto lg:block">
                    <table className="w-full min-w-[420px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-[0.62rem] tracking-wide text-slate-500 uppercase">
                          <th className="w-[40%] pb-2 font-medium">Item &amp; Code</th>
                          <th className="w-[18%] pb-2 text-right font-medium">Stock Qty</th>
                          <th className="w-[23%] pb-2 text-center font-medium">FEFO Expiry</th>
                          <th className="w-[19%] pb-2 text-right font-medium">Audit Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSample.items.map((item) => (
                          <tr key={item.sku} className="border-b border-slate-100">
                            <td className="py-2">
                              <div className="font-geist text-[0.75rem] font-medium text-ops-ink">{item.description}</div>
                              <div className="font-mono text-[0.62rem] text-slate-500">{item.sku}</div>
                            </td>
                            <td className="text-right font-mono text-[0.72rem] font-medium text-ops-teal">+{item.qty} units</td>
                            <td className="text-center">
                              <span className={fefoPillClass(item.fefoStatus)}>
                                {item.fefoStatus === 'urgent' ? <AlertTriangle size={11} /> : <Clock size={11} />}
                                <span>{item.fefoLabel}</span>
                              </span>
                            </td>
                            <td className="text-right">
                              <span className="inline-flex items-center justify-end gap-1 rounded px-[0.45rem] py-[0.18rem] text-[0.65rem] font-medium text-ops-teal">
                                <CheckCircle2 size={11} />
                                Confirmed
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex gap-4">
                      <div>
                        <span className="block text-[0.62rem] tracking-wide text-slate-500">Items</span>
                        <span className="font-mono text-[0.78rem] font-medium text-ops-ink">{selectedSample.items.length} lines</span>
                      </div>
                      <div>
                        <span className="block text-[0.62rem] tracking-wide text-slate-500">Volume</span>
                        <span className="font-mono text-[0.78rem] font-medium text-ops-ink">
                          {selectedSample.items.reduce((acc, curr) => acc + curr.qty, 0)} pcs
                        </span>
                      </div>
                      <div>
                        <span className="block text-[0.62rem] tracking-wide text-slate-500">Tax total</span>
                        <span className="font-mono text-[0.78rem] font-medium text-ops-teal">{selectedSample.total}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onCommitInventory(selectedSample)}
                      className={cn(
                        'inline-flex w-full items-center justify-center gap-[0.35rem] rounded-[0.35rem] px-[0.85rem] py-[0.5rem] font-display text-[0.76rem] font-medium text-white transition-all sm:w-auto',
                        isCommitted ? 'bg-ops-teal-hover' : 'bg-ops-teal hover:bg-ops-teal-hover',
                      )}
                    >
                      {isCommitted ? (
                        <>
                          <CheckCircle2 size={14} />
                          Inventory Saved
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet size={14} />
                          Commit to Live Inventory
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
