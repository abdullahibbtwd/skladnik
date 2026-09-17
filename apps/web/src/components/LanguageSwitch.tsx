import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { cn } from '../lib/cn';
import type { AppLang } from '../i18n';

const OPTIONS: { id: AppLang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'bg', label: 'БГ' },
];

export const LanguageSwitch: React.FC<{ className?: string; compact?: boolean }> = ({
  className,
  compact = false,
}) => {
  const { i18n, t } = useTranslation();
  const current: AppLang = i18n.language.toLowerCase().startsWith('bg') ? 'bg' : 'en';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm',
        className,
      )}
      role="group"
      aria-label={t('language.label')}
    >
      {!compact && <Languages size={13} className="ml-1.5 text-slate-400" />}
      {OPTIONS.map((option) => {
        const active = current === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => void i18n.changeLanguage(option.id)}
            className={cn(
              'rounded-full px-2 py-1 font-display text-[0.68rem] font-semibold tracking-wide transition-all',
              active ? 'bg-ops-teal text-white shadow-sm' : 'text-slate-500 hover:text-ops-ink',
            )}
            aria-pressed={active}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
