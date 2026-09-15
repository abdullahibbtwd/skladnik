import React from 'react';
import { Link } from 'react-router-dom';
import { Boxes, ShieldCheck, FileCheck2 } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-ops-canvas pt-12 pb-8 text-slate-500 md:pt-[4.5rem] md:pb-10">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mb-10 grid grid-cols-1 gap-8 md:mb-14 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.2fr] lg:gap-12">
          <div>
            <div className="mb-[0.85rem] flex items-center gap-[0.6rem] font-display text-lg font-semibold text-ops-ink md:text-xl">
              <div className="flex size-8 items-center justify-center rounded-lg bg-ops-teal text-white">
                <Boxes size={18} />
              </div>
              <span>Skladnik</span>
            </div>
            <p className="mb-5 max-w-80 text-[0.9rem] leading-relaxed">
              AI-driven retail inventory management. Transforming paper vendor invoices into
              accurate live stock, FEFO expiry schedules, and compliant Annex 38 tax audits.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-ops-teal/20 bg-teal-50 px-[0.7rem] py-[0.3rem] text-[0.78rem] font-medium text-ops-teal">
              <span className="size-2 animate-pulse-dot rounded-full bg-ops-teal shadow-[0_0_8px_#0d9488]" />
              <span>All Systems Operational &bull; Annex 38 Ready</span>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-[0.82rem] font-medium tracking-wide text-ops-ink md:mb-5">
              Platform
            </h4>
            <ul className="flex list-none flex-col gap-3">
              <li>
                <a href="#features" className="text-sm transition-colors hover:text-ops-ink">
                  Snap & Stock OCR
                </a>
              </li>
              <li>
                <a href="#features" className="text-sm transition-colors hover:text-ops-ink">
                  FEFO Expiry Board
                </a>
              </li>
              <li>
                <a href="#compliance" className="text-sm transition-colors hover:text-ops-ink">
                  Annex No. 38 Ready
                </a>
              </li>
              <li>
                <a href="#features" className="text-sm transition-colors hover:text-ops-ink">
                  Mobile Quick Scan
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-sm transition-colors hover:text-ops-ink">
                  Store Pricing Plans
                </a>
              </li>
              <li>
                <Link to="/login" className="text-sm transition-colors hover:text-ops-ink">
                  Log in
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-sm transition-colors hover:text-ops-ink">
                  Create a store account
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-display text-[0.82rem] font-medium tracking-wide text-ops-ink md:mb-5">
              Compliance
            </h4>
            <ul className="flex list-none flex-col gap-3">
              <li>
                <a href="#compliance" className="flex items-center gap-[0.3rem] text-sm transition-colors hover:text-ops-ink">
                  <span>Annex No. 38 XML</span>
                  <FileCheck2 size={13} className="text-ops-teal" />
                </a>
              </li>
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  Tax Audit Specifications
                </a>
              </li>
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  Food Expiry Safety (HACCP)
                </a>
              </li>
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  Data Encryption Standard
                </a>
              </li>
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-display text-[0.82rem] font-medium tracking-wide text-ops-ink md:mb-5">
              Compatibility
            </h4>
            <p className="mb-[0.85rem] text-[0.85rem] leading-normal text-slate-500">
              Compatible with iOS, Android, macOS, Windows, and standard receipt printers.
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-ops-canvas px-[0.65rem] py-1.5 text-[0.78rem] text-ops-ink">
              <ShieldCheck size={14} className="text-ops-teal" />
              <span>EU Retail Compliance Verified</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-8 text-[0.825rem] text-slate-500">
          <div>&copy; {new Date().getFullYear()} Skladnik Technologies. All rights reserved.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-ops-ink">
              Terms of Service
            </a>
            <a href="#" className="hover:text-ops-ink">
              Security Overview
            </a>
            <a href="#" className="hover:text-ops-ink">
              System Status
            </a>
            <a href="#" className="hover:text-ops-ink">
              Support Portal
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
