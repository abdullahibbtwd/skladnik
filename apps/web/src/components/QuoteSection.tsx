import React from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuoteForm } from './QuoteForm';

export const QuoteSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="quote" className="scroll-mt-24 border-t border-slate-200 bg-white py-14 md:py-24">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 md:grid-cols-[1fr_1.1fr] md:items-start md:gap-14 md:px-6">
        <div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ops-teal/10 px-3 py-[0.28rem] font-display text-[0.75rem] font-medium text-ops-teal md:mb-[0.85rem] md:text-[0.8rem]">
            <MessageSquareQuote size={14} />
            <span>{t('quote.badge')}</span>
          </div>
          <h2 className="mb-3 font-display text-[1.6rem] font-semibold tracking-tight text-ops-ink md:mb-4 md:text-[2.1rem]">
            {t('quote.title')}
          </h2>
          <p className="max-w-[420px] font-sans text-[0.95rem] leading-relaxed text-slate-600 md:text-[1.02rem]">
            {t('quote.subtitle')}
          </p>
        </div>
        <div className="relative rounded-2xl border border-slate-200 bg-ops-canvas/40 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-16px_rgba(30,27,75,0.12)] md:p-7">
          <QuoteForm />
        </div>
      </div>
    </section>
  );
};
