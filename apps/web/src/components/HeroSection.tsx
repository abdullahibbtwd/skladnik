import React from 'react';
import {
  Camera,
  FileCheck2,
  Zap,
  FileSpreadsheet,
  ShieldCheck,
  MonitorSmartphone,
  ArrowRight,
  Boxes,
  ScanLine,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { useTranslation } from 'react-i18next';

export const HeroSection: React.FC = () => {
  const { t } = useTranslation();

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
              <span className="truncate">{t('hero.badge')}</span>
            </div>

            <h1 className="mb-4 font-display text-[1.85rem] leading-[1.18] font-semibold tracking-tight text-ops-ink sm:text-[2.2rem] md:mb-[1.15rem] md:text-[3rem] md:leading-[1.12]">
              {t('hero.title1')}
              <br />
              {t('hero.title2')}
              <br />
              <span className="inline-block font-semibold text-ops-teal">{t('hero.title3')}</span>
            </h1>

            <p className="mb-6 max-w-[520px] px-1 font-sans text-[0.95rem] leading-relaxed text-slate-500 md:mb-8 md:text-[1.05rem]">
              {t('hero.subtitle')}
            </p>

            <div className="mb-7 flex w-full max-w-[520px] flex-wrap items-center justify-center gap-3 lg:mb-9 lg:max-w-none lg:justify-start">
              <Link
                to="/signup"
                className="inline-flex w-full items-center justify-center gap-[0.65rem] rounded-[0.55rem] bg-ops-teal px-5 py-[0.75rem] font-display text-[0.92rem] font-medium text-white shadow-[0_4px_14px_rgba(13,148,136,0.28)] transition-all hover:bg-ops-teal-hover sm:w-auto sm:px-[1.45rem]"
              >
                <Camera size={17} strokeWidth={2} />
                <span>{t('hero.cta')}</span>
              </Link>
            </div>

            <div className="grid w-full max-w-[520px] grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-200 pt-6 md:gap-x-7 md:gap-y-5 md:pt-[1.85rem] lg:max-w-none">
              {[
                { icon: Zap, title: t('hero.stat1Title'), sub: t('hero.stat1Sub'), tone: 'teal' },
                { icon: ShieldCheck, title: t('hero.stat2Title'), sub: t('hero.stat2Sub'), tone: 'indigo' },
                { icon: FileCheck2, title: t('hero.stat3Title'), sub: t('hero.stat3Sub'), tone: 'warn' },
                { icon: MonitorSmartphone, title: t('hero.stat4Title'), sub: t('hero.stat4Sub'), tone: 'teal' },
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
                    {t('hero.ocrEngine')} <span className="hidden sm:inline">{t('hero.ocrReady')}</span>
                  </span>
                </div>
              </div>

              <div className="grid w-full grid-cols-1 bg-white lg:min-h-[440px] lg:grid-cols-[minmax(0,1fr)_44px_minmax(0,1.35fr)]">
                <div className="flex min-w-0 flex-col overflow-hidden border-slate-100 bg-ops-canvas/50 p-3 md:p-[1.05rem] lg:border-r">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-[0.35rem] font-display text-[0.72rem] font-medium tracking-wide text-ops-ai uppercase">
                      <Camera size={13} />
                      <span>{t('hero.scannedFrame')}</span>
                    </div>
                  </div>

                  <div className="relative flex min-w-0 flex-1 flex-col justify-between overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[0.72rem] text-ops-ink shadow-[0_8px_20px_-10px_rgba(30,27,75,0.12)] md:p-[1.05rem] md:text-[0.74rem]">
                    <div>
                      <div className="mb-[0.55rem] border-b-[1.5px] border-dashed border-slate-300 pb-[0.55rem]">
                        <div className="mb-1 font-sans text-[0.8rem] font-semibold text-slate-900">{t('hero.supplierPlaceholder')}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-slate-500">
                          <span>
                            {t('hero.inv')}: <strong className="font-mono text-slate-400">—</strong>
                          </span>
                          <span>
                            {t('hero.date')}: <strong className="font-mono text-slate-400">—</strong>
                          </span>
                          <span>
                            {t('hero.vat')}: <strong className="font-mono text-slate-400">—</strong>
                          </span>
                        </div>
                      </div>
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="text-[0.62rem] tracking-wide text-slate-500 uppercase">
                            <th className="w-[60%] pb-1 font-semibold">{t('hero.itemDescription')}</th>
                            <th className="w-[18%] pb-1 text-center font-semibold">{t('hero.qty')}</th>
                            <th className="w-[22%] pb-1 text-right font-semibold">{t('hero.price')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={3} className="py-8 text-center font-sans text-[0.78rem] font-medium text-slate-400">
                              {t('hero.emptyLines')}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                        <span className="font-sans text-[0.7rem] font-medium text-slate-500">{t('hero.grossTotal')}</span>
                        <span className="font-mono text-sm font-semibold text-slate-400">—</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[0.65rem] text-slate-500">
                        <ScanLine size={12} color="#9333EA" />
                        <span>{t('hero.ocrBoxes')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 px-4 py-2 lg:hidden">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="font-mono text-[0.62rem] tracking-wider text-slate-400">{t('hero.pipeline')}</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="hidden flex-col items-center justify-center gap-3 overflow-hidden lg:flex">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ops-teal text-white">
                    <ArrowRight size={13} />
                  </div>
                  <span className="font-mono text-[0.58rem] tracking-wider text-slate-400 uppercase [writing-mode:vertical-rl]">{t('hero.pipeline')}</span>
                </div>

                <div className="flex min-w-0 flex-col p-3 md:p-[1.05rem]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-ops-ai/20 bg-purple-50 px-2 py-0.5 font-display text-[0.65rem] font-medium text-ops-ai">
                        <ScanLine size={12} />
                        {t('hero.cameraReader')}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-ops-teal/20 bg-teal-50 px-2 py-0.5 font-display text-[0.65rem] font-medium text-ops-teal">
                        <FileCheck2 size={12} />
                        {t('hero.annex38')}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-ops-canvas px-4 py-10 text-center">
                    <p className="max-w-[16rem] font-sans text-[0.8rem] leading-relaxed text-slate-500">{t('hero.emptyStock')}</p>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex gap-4">
                      <div>
                        <span className="block text-[0.62rem] tracking-wide text-slate-500">{t('hero.items')}</span>
                        <span className="font-mono text-[0.78rem] font-medium text-ops-ink">{t('hero.lines', { count: 0 })}</span>
                      </div>
                      <div>
                        <span className="block text-[0.62rem] tracking-wide text-slate-500">{t('hero.volume')}</span>
                        <span className="font-mono text-[0.78rem] font-medium text-ops-ink">0 {t('hero.pcs')}</span>
                      </div>
                    </div>
                    <Link
                      to="/signup"
                      className="inline-flex w-full items-center justify-center gap-[0.35rem] rounded-[0.35rem] bg-ops-teal px-[0.85rem] py-[0.5rem] font-display text-[0.76rem] font-medium text-white transition-all hover:bg-ops-teal-hover sm:w-auto"
                    >
                      <FileSpreadsheet size={14} />
                      {t('hero.commitInventory')}
                    </Link>
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
