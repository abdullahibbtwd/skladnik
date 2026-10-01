import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportCell, ReportColumnType, ReportLang } from '@skladnik/shared';
import { businessToday, shiftDate } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { appLocale, formatDate, formatMoney, formatPercent, formatPrice, formatQty, formatInt } from '../../lib/format';
import { flattenProductGroups } from '../../lib/workspace-api';
import { useProductGroupsQuery, useSitesQuery } from '../../lib/workspace-session';
import { DateRangeFields } from '../ui/DateField';
import type { SelectOption } from '../ui/Select';

export function reportLang(language: string | undefined): ReportLang {
  return language?.startsWith('bg') ? 'bg' : 'en';
}

export function monthStart(date: string) {
  return `${date.slice(0, 8)}01`;
}

export const dateInputClass =
  'h-10 rounded-xl border border-slate-200 bg-white px-3 font-mono text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50';

export type DateRange = { from: string; to: string };

export type PeriodPresetKey = 'today' | 'thisMonth' | 'lastMonth' | 'last30' | 'thisYear';

export function periodPresets(today: string): Record<PeriodPresetKey, DateRange> {
  const lastMonthEnd = shiftDate(monthStart(today), -1);
  return {
    today: { from: today, to: today },
    thisMonth: { from: monthStart(today), to: today },
    lastMonth: { from: monthStart(lastMonthEnd), to: lastMonthEnd },
    last30: { from: shiftDate(today, -29), to: today },
    thisYear: { from: `${today.slice(0, 4)}-01-01`, to: today },
  };
}

/**
 * ACC-12: highlight only the chip the user chose. Do not infer the preset from the date range
 * (on the 1st of the month "Днес" and "Този месец" are the same range).
 */
export function PeriodPicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const { t } = useTranslation();
  const today = businessToday();
  const presets = periodPresets(today);
  const [chosen, setChosen] = useState<PeriodPresetKey | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <DateRangeFields
        from={value.from}
        to={value.to}
        onChange={(range) => {
          setChosen(null);
          onChange(range);
        }}
        max={today}
        fromLabel={t('reports.from')}
        toLabel={t('reports.to')}
      />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(presets) as PeriodPresetKey[]).map((key) => {
          const preset = presets[key];
          const active = chosen === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setChosen(key);
                onChange(preset);
              }}
              className={cn(
                'rounded-lg border px-2.5 py-1 font-display text-[0.74rem] font-medium',
                active ? 'border-ops-accent/30 bg-indigo-50 text-ops-accent' : 'border-slate-200 bg-white text-slate-600 hover:border-ops-accent/20',
              )}
            >
              {t(`reports.presets.${key}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "All my sites" first, then every site the user can see; inactive ones stay listed for history. */
export function useSiteOptions(): SelectOption[] {
  const { t } = useTranslation();
  const sitesQuery = useSitesQuery();
  return useMemo(
    () => [
      { value: '', label: t('reports.allSites') },
      ...(sitesQuery.data?.sites ?? []).map((site) => ({
        value: site.id,
        label: site.isActive ? site.name : `${site.name} (${t('reports.inactive')})`,
      })),
    ],
    [sitesQuery.data, t],
  );
}

export function useGroupOptions(): SelectOption[] {
  const { t } = useTranslation();
  const groupsQuery = useProductGroupsQuery();
  return useMemo(
    () => [
      { value: '', label: t('reports.allGroups') },
      ...flattenProductGroups(groupsQuery.data?.groups ?? []).map((group) => ({ value: group.id, label: group.label })),
    ],
    [groupsQuery.data, t],
  );
}

export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="font-display text-[0.7rem] font-medium tracking-wider text-slate-500 uppercase">{label}</span>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-slate-200 bg-ops-canvas p-1" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 font-display text-[0.78rem] font-medium',
            value === option.value ? 'bg-white text-ops-accent shadow-sm' : 'text-slate-500 hover:text-ops-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Screen and print formatting of report cells in the chosen language. */
export function useCellFormatter(lang: ReportLang) {
  return useMemo(() => {
    const locale = appLocale(lang);
    const cell = (value: ReportCell | undefined, type: ReportColumnType) => {
      if (value === null || value === undefined || value === '') return '';
      if (typeof value === 'string') return type === 'date' ? formatDate(value, lang) : value;
      if (type === 'percent') return formatPercent(value, lang);
      if (type === 'text' || type === 'date') return String(value);
      if (type === 'qty') return formatQty(value, lang);
      if (type === 'int') return formatInt(value, lang);
      if (type === 'price') return formatPrice(value, lang);
      if (type === 'money') return formatMoney(value, lang);
      return String(value);
    };
    return { cell, date: (value: string) => formatDate(value, lang), locale };
  }, [lang]);
}
