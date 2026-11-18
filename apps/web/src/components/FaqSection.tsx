import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const FAQ_KEYS = ['trial', 'card', 'afterTrial', 'activation'] as const;

export const FaqSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="faq" className="scroll-mt-24 border-t border-slate-200 bg-ops-canvas py-14 md:py-24">
      <div className="mx-auto w-full max-w-[800px] px-4 md:px-6">
        <div className="mb-8 text-center md:mb-10">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ops-teal/10 px-3 py-[0.28rem] font-display text-[0.75rem] font-medium text-ops-teal md:mb-[0.85rem] md:text-[0.8rem]">
            <HelpCircle size={14} />
            <span>{t('faq.badge')}</span>
          </div>
          <h2 className="mb-3 font-display text-[1.6rem] font-semibold tracking-tight text-ops-ink md:mb-4 md:text-[2.1rem]">
            {t('faq.title')}
          </h2>
          <p className="mx-auto max-w-[520px] font-sans text-[0.95rem] leading-relaxed text-slate-600 md:text-[1.02rem]">
            {t('faq.subtitle')}
          </p>
        </div>

        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {FAQ_KEYS.map((key) => (
            <details key={key} className="group py-4 md:py-5">
              <summary className="cursor-pointer list-none font-display text-[1.02rem] font-medium text-ops-ink marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-start justify-between gap-4">
                  <span>{t(`faq.${key}Q`)}</span>
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 font-mono text-lg leading-none text-slate-400 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 max-w-[640px] pr-8 font-sans text-[0.95rem] leading-relaxed text-slate-600 md:text-[1rem]">
                {t(`faq.${key}A`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
