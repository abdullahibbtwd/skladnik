import React from 'react';
import { Check, ShieldCheck, ArrowRight, Users, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export const PricingSection: React.FC = () => {
  const { t } = useTranslation();
  const plans = [
    {
      key: 'starter',
      name: t('pricing.starterName'),
      subtitle: t('pricing.starterSubtitle'),
      seats: t('pricing.starterSeats'),
      sites: t('pricing.starterSites'),
      summary: t('pricing.starterSummary'),
      features: [
        t('pricing.starterF1'),
        t('pricing.starterF2'),
        t('pricing.starterF3'),
        t('pricing.starterF4'),
        t('pricing.starterF5'),
      ],
      ctaText: t('pricing.startTrial'),
      ctaTo: '/signup',
      featured: false,
      isPrimary: false,
    },
    {
      key: 'pro',
      name: t('pricing.proName'),
      subtitle: t('pricing.proSubtitle'),
      seats: t('pricing.proSeats'),
      sites: t('pricing.proSites'),
      summary: t('pricing.proSummary'),
      features: [
        t('pricing.proF1'),
        t('pricing.proF2'),
        t('pricing.proF3'),
        t('pricing.proF4'),
        t('pricing.proF5'),
      ],
      ctaText: t('pricing.startTrial'),
      ctaTo: '/signup',
      featured: true,
      isPrimary: true,
    },
    {
      key: 'multi',
      name: t('pricing.multiName'),
      subtitle: t('pricing.multiSubtitle'),
      seats: t('pricing.multiSeats'),
      sites: t('pricing.multiSites'),
      summary: t('pricing.multiSummary'),
      features: [
        t('pricing.multiF1'),
        t('pricing.multiF2'),
        t('pricing.multiF3'),
        t('pricing.multiF4'),
        t('pricing.multiF5'),
      ],
      ctaText: t('pricing.contactSales'),
      ctaTo: '/signup',
      featured: false,
      isPrimary: false,
    },
  ] as const;

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-slate-200 bg-ops-canvas py-14 md:py-24">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-16">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ops-teal/10 px-3 py-[0.28rem] font-display text-[0.75rem] font-medium text-ops-teal md:mb-[0.85rem] md:text-[0.8rem]">
            <ShieldCheck size={14} />
            <span>{t('pricing.badge')}</span>
          </div>
          <h2 className="mb-3 font-display text-[1.6rem] font-semibold tracking-tight text-ops-ink md:mb-4 md:text-[2.4rem]">
            {t('pricing.title')}
          </h2>
          <p className="font-sans text-[0.95rem] leading-relaxed text-slate-600 md:text-[1.05rem]">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-3 md:gap-6">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-16px_rgba(30,27,75,0.14)] md:p-8',
                plan.featured
                  ? 'border-ops-teal shadow-[0_12px_32px_rgba(13,148,136,0.16)] md:-mt-2 md:mb-[-0.5rem] md:border-2'
                  : 'border-slate-200/90',
              )}
            >
              {plan.featured && (
                <div className="absolute top-[-0.75rem] left-1/2 -translate-x-1/2 rounded-full bg-ops-teal px-[0.85rem] py-1 font-display text-xs font-medium tracking-wide text-white">
                  {t('pricing.recommended')}
                </div>
              )}

              <div className="mb-5">
                <h3 className="mb-1 font-display text-[1.2rem] font-semibold tracking-tight text-ops-ink md:text-[1.3rem]">
                  {plan.name}
                </h3>
                <p className="font-sans text-[0.88rem] leading-snug text-slate-500">{plan.subtitle}</p>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-ops-canvas px-2.5 py-1 font-display text-[0.72rem] font-medium text-ops-ink">
                  <Users size={12} className="text-ops-teal" />
                  {plan.seats}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-ops-canvas px-2.5 py-1 font-display text-[0.72rem] font-medium text-ops-ink">
                  <Store size={12} className="text-ops-teal" />
                  {plan.sites}
                </span>
              </div>

              <p className="mb-6 font-sans text-[0.88rem] leading-relaxed text-slate-600">{plan.summary}</p>

              <ul className="mb-8 flex list-none flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 font-sans text-[0.88rem] leading-snug text-slate-700">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ops-teal/12 text-ops-teal">
                      <Check size={12} strokeWidth={2.8} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <Link
                  to={plan.ctaTo}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-[0.9rem] font-medium transition-all',
                    plan.isPrimary
                      ? 'bg-ops-teal text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)] hover:bg-ops-teal-hover'
                      : 'border border-slate-200 bg-white text-ops-ink shadow-sm hover:border-ops-teal/40 hover:bg-teal-50 hover:text-ops-teal',
                  )}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight size={16} />
                </Link>
                <p className="mt-3 text-center font-sans text-[0.72rem] text-slate-400">{t('pricing.footnote')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
