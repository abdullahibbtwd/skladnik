import React from 'react';
import { Camera, Cpu, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const HowItWorks: React.FC = () => {
  const { t } = useTranslation();
  const steps = [
    {
      number: '01',
      icon: <Camera size={22} strokeWidth={1.8} />,
      title: t('how.step1Title'),
      description: t('how.step1Body'),
    },
    {
      number: '02',
      icon: <Cpu size={22} strokeWidth={1.8} />,
      title: t('how.step2Title'),
      description: t('how.step2Body'),
    },
    {
      number: '03',
      icon: <CheckCircle2 size={22} strokeWidth={1.8} />,
      title: t('how.step3Title'),
      description: t('how.step3Body'),
    },
  ];

  return (
    <section id="how-it-works" className="relative scroll-mt-24 border-t border-slate-200 bg-ops-canvas py-14 text-ops-ink md:py-24">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mx-auto mb-8 max-w-[720px] text-center md:mb-10">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ops-ai/10 px-3 py-[0.28rem] font-display text-[0.75rem] font-medium text-ops-ai md:mb-[0.85rem] md:text-[0.8rem]">
            {t('how.badge')}
          </div>
          <h2 className="mb-3 font-display text-[1.6rem] leading-tight font-semibold tracking-tight text-ops-ink md:mb-4 md:text-[2.4rem]">
            {t('how.title')}
          </h2>
          <p className="font-sans text-[0.95rem] leading-relaxed text-slate-500 md:text-[1.05rem]">
            {t('how.subtitle')}
          </p>
        </div>

        <div className="relative mt-8 grid grid-cols-1 gap-5 md:mt-14 md:grid-cols-3 md:gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-ops-accent/30 hover:shadow-[0_12px_28px_-12px_rgba(79,70,229,0.18)] md:p-8"
            >
              <span className="absolute top-5 right-5 font-mono text-3xl font-semibold text-ops-ink/8 md:text-4xl">
                {step.number}
              </span>
              <div className="mb-5 flex size-11 items-center justify-center rounded-[0.65rem] bg-ops-teal/10 text-ops-teal md:size-12">
                {step.icon}
              </div>
              <h3 className="mb-[0.65rem] font-display text-[1.1rem] font-semibold text-ops-ink md:text-[1.2rem]">{step.title}</h3>
              <p className="font-sans text-[0.9rem] leading-relaxed text-slate-500">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
