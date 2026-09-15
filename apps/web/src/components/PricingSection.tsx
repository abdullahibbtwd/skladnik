import React from 'react';
import { Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { cn } from '../lib/cn';

interface PricingSectionProps {
  onOpenDemo: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onOpenDemo }) => {
  const plans = [
    {
      name: 'Starter Shop',
      subtitle: 'For independent corner stores and neighbourhood kiosks.',
      price: '0',
      currency: '€',
      period: '/ month',
      featured: false,
      placeholderSummary: 'Early access tier for local independent shops.',
      features: ['Core OCR receipt scanning', 'Basic stock management', 'Feature details coming soon'],
      ctaText: 'Start Free Trial',
      isPrimary: false,
    },
    {
      name: 'Pro Store',
      subtitle: 'For busy grocery stores, bakeries, and cafes.',
      price: '0',
      currency: '€',
      period: '/ month',
      featured: true,
      placeholderSummary: 'Full platform access during our launch preview.',
      features: [
        '20-second fast AI document engine',
        'FEFO expiry tracking & waste alerts',
        'Annex No. 38 XML compliance ready',
      ],
      ctaText: 'Start Free Trial',
      isPrimary: true,
    },
    {
      name: 'Multi-Location',
      subtitle: 'For expanding retail chains, franchises, and multi-branch outlets.',
      price: '0',
      currency: '€',
      period: '/ month',
      featured: false,
      placeholderSummary: 'Enterprise onboarding and centralized audit control.',
      features: ['Multi-branch stock sync', 'Custom register & POS setup', 'Priority technical assistance'],
      ctaText: 'Contact Sales',
      isPrimary: false,
    },
  ];

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-slate-200 bg-white py-14 md:py-24">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-16">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ops-teal/10 px-3 py-[0.28rem] font-display text-[0.75rem] font-medium text-ops-teal md:mb-[0.85rem] md:text-[0.8rem]">
            <ShieldCheck size={14} />
            <span>Store plans</span>
          </div>
          <h2 className="mb-3 font-display text-[1.6rem] font-semibold tracking-tight text-ops-ink md:mb-4 md:text-[2.4rem]">
            Accessible for Every Retailer
          </h2>
          <p className="font-sans text-[0.95rem] leading-relaxed text-slate-600 md:text-[1.05rem]">
            Get started immediately with full access during our preview release.
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3 md:gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all md:p-10',
                plan.featured && 'border-ops-teal shadow-[0_12px_28px_rgba(13,148,136,0.14)] md:scale-[1.03] md:border-2',
              )}
            >
              {plan.featured && (
                <div className="absolute top-[-0.75rem] left-1/2 -translate-x-1/2 rounded-full bg-ops-teal px-[0.85rem] py-1 font-display text-xs font-medium tracking-wide text-white">
                  Recommended
                </div>
              )}

              <div>
                <h3 className="mb-[0.35rem] font-display text-[1.2rem] font-semibold text-ops-ink md:text-[1.3rem]">{plan.name}</h3>
                <p className="mb-6 font-sans text-[0.85rem] text-slate-600">{plan.subtitle}</p>

                <div className="mb-5 flex items-baseline gap-[0.15rem]">
                  <span className="font-display text-xl font-semibold text-ops-ink md:text-[1.75rem]">{plan.currency}</span>
                  <span className="font-display text-4xl leading-none font-semibold tracking-tight text-ops-ink md:text-5xl">
                    {plan.price}
                  </span>
                  <span className="ml-1 font-sans text-[0.9rem] font-medium text-slate-600">{plan.period}</span>
                </div>

                <div className="mb-6 rounded-lg border border-ops-teal/20 bg-teal-50 px-[0.85rem] py-[0.55rem] font-sans text-[0.8rem] leading-snug font-medium text-ops-teal">
                  {plan.placeholderSummary}
                </div>

                <ul className="mb-9 flex list-none flex-col gap-[0.85rem]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-[0.65rem] font-sans text-sm font-medium text-slate-700">
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ops-teal/12 text-ops-teal">
                        <Check size={13} strokeWidth={2.8} />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={onOpenDemo}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-[0.72rem] font-display text-[0.9rem] font-medium transition-all',
                  plan.isPrimary
                    ? 'bg-ops-teal text-white shadow-[0_2px_8px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover'
                    : 'border border-slate-300 bg-white text-ops-ink shadow-sm hover:border-ops-accent hover:bg-ops-accent hover:text-white',
                )}
              >
                <span>{plan.ctaText}</span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-[3px]" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
