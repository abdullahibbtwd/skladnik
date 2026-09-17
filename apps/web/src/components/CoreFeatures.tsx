import React from 'react';
import {
  Camera,
  CalendarClock,
  FileCode2,
  MonitorSmartphone,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const iconBox = (tone: 'teal' | 'warn' | 'indigo') =>
  ({
    teal: 'bg-ops-teal/10 text-ops-teal border-ops-teal/20',
    warn: 'bg-ops-warn/10 text-ops-warn border-ops-warn/20',
    indigo: 'bg-ops-accent/10 text-ops-accent border-ops-accent/20',
  })[tone];

const tagClass = (tone: 'teal' | 'warn' | 'indigo') =>
  ({
    teal: 'bg-teal-50 text-ops-teal',
    warn: 'bg-orange-50 text-ops-warn',
    indigo: 'bg-indigo-50 text-ops-accent',
  })[tone];

export const CoreFeatures: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="features" className="relative scroll-mt-24 border-t border-slate-200 bg-white py-14 md:py-24">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-16">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ops-teal/10 px-3 py-[0.28rem] font-display text-[0.75rem] font-medium text-ops-teal md:mb-[0.85rem] md:text-[0.8rem]">
            <Layers size={14} />
            <span>{t('features.badge')}</span>
          </div>
          <h2 className="mb-3 font-display text-[1.6rem] leading-tight font-semibold tracking-tight text-ops-ink md:mb-4 md:text-[2.4rem]">
            {t('features.title')}
          </h2>
          <p className="font-sans text-[0.95rem] leading-relaxed text-slate-600 md:text-[1.05rem]">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <article className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-ops-teal/30 hover:shadow-[0_12px_28px_-12px_rgba(13,148,136,0.2)] md:p-9">
            <div>
              <div className="mb-6 flex items-start justify-between">
                <div className={`flex size-[3.25rem] items-center justify-center rounded-xl border ${iconBox('teal')}`}>
                  <Camera size={26} strokeWidth={2.2} />
                </div>
                <span className={`rounded-full px-2.5 py-1 font-display text-[0.72rem] font-medium ${tagClass('teal')}`}>
                  {t('features.ocrTag')}
                </span>
              </div>
              <h3 className="mb-3 font-display text-xl font-semibold text-ops-ink md:text-[1.3rem]">{t('features.ocrTitle')}</h3>
              <p className="mb-6 font-sans text-[0.95rem] leading-relaxed text-slate-600">
                {t('features.ocrBody')}
              </p>
            </div>
            <div className="rounded-[0.65rem] border border-slate-200 bg-slate-100 p-4 text-[0.8rem]">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
                <span className="flex items-center gap-[0.3rem]">
                  <CheckCircle2 size={14} color="#0D9488" />
                  {t('features.ocrAligned')}
                </span>
                <span className="font-mono text-ops-teal">{t('features.ocrConfidence')}</span>
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-[0.65rem] sm:flex-row sm:items-center sm:justify-between sm:px-[0.85rem]">
                <div className="min-w-0">
                  <div className="font-sans text-[0.8rem] font-medium text-ops-ink">{t('features.invoiceLine')}</div>
                  <div className="font-mono text-[0.7rem] text-slate-500">{t('features.skuDetected')}</div>
                </div>
                <Link
                  to="/signup"
                  className="inline-flex w-fit items-center gap-[0.3rem] rounded bg-teal-50 px-2.5 py-[0.3rem] font-display text-[0.72rem] font-medium text-ops-teal"
                >
                  {t('features.testOcr')}
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </article>

          <article className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-ops-warn/30 hover:shadow-[0_12px_28px_-12px_rgba(234,88,12,0.16)] md:p-9">
            <div>
              <div className="mb-6 flex items-start justify-between">
                <div className={`flex size-[3.25rem] items-center justify-center rounded-xl border ${iconBox('warn')}`}>
                  <CalendarClock size={26} strokeWidth={2.2} />
                </div>
                <span className={`rounded-full px-2.5 py-1 font-display text-[0.72rem] font-medium ${tagClass('warn')}`}>
                  {t('features.wasteTag')}
                </span>
              </div>
              <h3 className="mb-3 font-display text-xl font-semibold text-ops-ink md:text-[1.3rem]">{t('features.wasteTitle')}</h3>
              <p className="mb-6 font-sans text-[0.95rem] leading-relaxed text-slate-600">
                {t('features.wasteBody')}
              </p>
            </div>
            <div className="rounded-[0.65rem] border border-slate-200 bg-slate-100 p-4 text-[0.8rem]">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
                <span className="flex items-center gap-[0.3rem]">
                  <AlertCircle size={14} color="#EA580C" />
                  {t('features.expiring48')}
                </span>
                <span className="flex items-center gap-[0.2rem] font-medium text-ops-teal">
                  {t('features.shrinkage')}
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-[0.65rem] sm:flex-row sm:items-center sm:justify-between sm:px-[0.85rem]">
                <div className="min-w-0">
                  <div className="font-sans text-[0.8rem] font-medium text-ops-ink">{t('features.expiryWatch')}</div>
                  <div className="text-[0.7rem] font-medium text-slate-500">{t('features.expiryHint')}</div>
                </div>
                <span className="rounded bg-rose-50 px-2 py-[0.2rem] text-[0.7rem] font-medium text-ops-danger">
                  {t('features.priorityShelf')}
                </span>
              </div>
            </div>
          </article>

          <article id="compliance" className="relative scroll-mt-24 flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-ops-accent/30 hover:shadow-[0_12px_28px_-12px_rgba(79,70,229,0.18)] md:p-9">
            <div>
              <div className="mb-6 flex items-start justify-between">
                <div className={`flex size-[3.25rem] items-center justify-center rounded-xl border ${iconBox('indigo')}`}>
                  <FileCode2 size={26} strokeWidth={2.2} />
                </div>
                <span className={`rounded-full px-2.5 py-1 font-display text-[0.72rem] font-medium ${tagClass('indigo')}`}>
                  {t('features.taxTag')}
                </span>
              </div>
              <h3 className="mb-3 font-display text-xl font-semibold text-ops-ink md:text-[1.3rem]">{t('features.taxTitle')}</h3>
              <p className="mb-6 font-sans text-[0.95rem] leading-relaxed text-slate-600">
                {t('features.taxBody')}
              </p>
            </div>
            <div className="rounded-[0.65rem] border border-slate-200 bg-slate-100 p-4 text-[0.8rem]">
              <div className="mb-2 flex flex-col gap-1 text-xs font-medium text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span className="truncate font-mono">{t('features.xmlFilename')}</span>
                <span className="rounded bg-teal-50 px-1.5 py-[0.15rem] text-[0.7rem] font-medium text-ops-teal">
                  {t('features.validatedSchema')}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-[0.85rem] py-[0.65rem] text-[0.72rem] text-slate-500">
                <span className="max-w-full font-sans text-ops-ink">{t('features.xmlHint')}</span>
                <Link to="/signup" className="inline-flex shrink-0 items-center gap-1 font-display text-[0.72rem] font-medium text-ops-accent">
                  {t('features.openAccount')}
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </article>

          <article className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-ops-teal/30 hover:shadow-[0_12px_28px_-12px_rgba(13,148,136,0.2)] md:p-9">
            <div>
              <div className="mb-6 flex items-start justify-between">
                <div className={`flex size-[3.25rem] items-center justify-center rounded-xl border ${iconBox('teal')}`}>
                  <MonitorSmartphone size={26} strokeWidth={2.2} />
                </div>
                <span className={`rounded-full px-2.5 py-1 font-display text-[0.72rem] font-medium ${tagClass('teal')}`}>
                  {t('features.accessTag')}
                </span>
              </div>
              <h3 className="mb-3 font-display text-xl font-semibold text-ops-ink md:text-[1.3rem]">{t('features.accessTitle')}</h3>
              <p className="mb-6 font-sans text-[0.95rem] leading-relaxed text-slate-600">
                {t('features.accessBody')}
              </p>
            </div>
            <div className="rounded-[0.65rem] border border-slate-200 bg-slate-100 p-4 text-[0.8rem]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-[0.35rem] text-xs font-medium text-slate-600">
                <span>{t('features.syncedDevices')}</span>
                <span className="flex items-center gap-[0.2rem] text-ops-teal">
                  <Layers size={13} />
                  {t('features.liveWebsocket')}
                </span>
              </div>
              <div className="flex flex-wrap justify-start gap-3 rounded-md border border-slate-200 bg-white px-[0.85rem] py-[0.65rem] text-[0.72rem] font-medium text-ops-ink">
                <div className="flex items-center gap-[0.35rem]">
                  <CheckCircle2 size={13} color="#0D9488" />
                  {t('features.staffPhone')}
                </div>
                <div className="flex items-center gap-[0.35rem]">
                  <CheckCircle2 size={13} color="#0D9488" />
                  {t('features.tabletRegister')}
                </div>
                <div className="flex items-center gap-[0.35rem]">
                  <CheckCircle2 size={13} color="#0D9488" />
                  {t('features.ownerDashboard')}
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};
