import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { appLocale, formatDate, parseDisplayDate } from '../../lib/format';
import { businessToday } from '../../lib/business-date';

type DateFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

function monthLabel(year: number, month: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

function weekdayLabels(locale: string) {
  // Monday-first, matching Bulgarian calendars.
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.UTC(2024, 0, 1 + index)); // 2024-01-01 is Monday
    return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
  });
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function startWeekday(year: number, month: number) {
  // 0 = Monday … 6 = Sunday
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
}

export function DateField({ id, value, onChange, min, max, disabled, className, 'aria-label': ariaLabel }: DateFieldProps) {
  const { i18n, t } = useTranslation();
  const locale = appLocale(i18n.language);
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (value ? formatDate(value, i18n.language) : ''));
  const [view, setView] = useState(() => {
    const base = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : businessToday();
    return { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) - 1 };
  });

  useEffect(() => {
    setText(value ? formatDate(value, i18n.language) : '');
  }, [value, i18n.language]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commitText = () => {
    if (!text.trim()) {
      onChange('');
      return;
    }
    const parsed = parseDisplayDate(text);
    if (!parsed) {
      setText(value ? formatDate(value, i18n.language) : '');
      return;
    }
    if (min && parsed < min) {
      onChange(min);
      return;
    }
    if (max && parsed > max) {
      onChange(max);
      return;
    }
    onChange(parsed);
  };

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const weeks: (string | null)[][] = [];
  const total = daysInMonth(view.year, view.month);
  const pad = startWeekday(view.year, view.month);
  let week: (string | null)[] = Array.from({ length: pad }, () => null);
  for (let day = 1; day <= total; day += 1) {
    const iso = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    week.push(iso);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const today = businessToday();
  const labels = weekdayLabels(locale);
  const popup =
    open &&
    createPortal(
      <div
        role="dialog"
        aria-label={t('common.pickDate')}
        className="fixed z-[160] w-[18.5rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_50px_-20px_rgba(30,27,75,0.45)]"
        style={(() => {
          const rect = rootRef.current?.getBoundingClientRect();
          if (!rect) return { top: 0, left: 0 };
          const top = Math.min(rect.bottom + 6, window.innerHeight - 340);
          const left = Math.min(rect.left, window.innerWidth - 310);
          return { top, left };
        })()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-ops-canvas"
            aria-label={t('common.prevMonth')}
            onClick={() =>
              setView((prev) => {
                const month = prev.month - 1;
                return month < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month };
              })
            }
          >
            <ChevronLeft size={16} />
          </button>
          <p className="font-display text-[0.84rem] font-medium capitalize text-ops-ink">{monthLabel(view.year, view.month, locale)}</p>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-ops-canvas"
            aria-label={t('common.nextMonth')}
            onClick={() =>
              setView((prev) => {
                const month = prev.month + 1;
                return month > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month };
              })
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {labels.map((label) => (
            <span key={label} className="py-1 text-center font-display text-[0.66rem] font-medium tracking-wide text-slate-400 uppercase">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {weeks.flat().map((iso, index) => {
            if (!iso) return <span key={`e-${index}`} />;
            const disabledDay = Boolean((min && iso < min) || (max && iso > max));
            const selected = iso === value;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabledDay}
                onClick={() => pick(iso)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-lg font-mono text-[0.78rem] transition-colors',
                  selected && 'bg-ops-teal text-white',
                  !selected && isToday && 'border border-ops-teal/40 text-ops-teal',
                  !selected && !isToday && 'text-ops-ink hover:bg-ops-canvas',
                  disabledDay && 'pointer-events-none opacity-30',
                )}
              >
                {Number(iso.slice(8, 10))}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
          <button type="button" className="rounded-lg px-2 py-1 font-display text-[0.74rem] text-ops-teal hover:bg-teal-50" onClick={() => pick(today)}>
            {t('common.today')}
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1 font-display text-[0.74rem] text-slate-500 hover:bg-ops-canvas"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {t('common.clear')}
          </button>
        </div>
      </div>,
      document.body,
    );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          placeholder={i18n.language.startsWith('bg') ? 'ДД.ММ.ГГГГ' : 'DD.MM.YYYY'}
          disabled={disabled}
          value={text}
          aria-label={ariaLabel}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitText();
              setOpen(false);
            }
          }}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pr-10 pl-3 font-mono text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={t('common.pickDate')}
          onClick={() => {
            if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
              setView({ year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) - 1 });
            }
            setOpen((prev) => !prev);
          }}
          className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-ops-canvas hover:text-ops-teal disabled:opacity-40"
        >
          <CalendarDays size={15} />
        </button>
      </div>
      {popup}
    </div>
  );
}

/** Two date fields with a shared max of today when used as a report period. */
export function DateRangeFields({
  from,
  to,
  onChange,
  max = businessToday(),
  fromLabel,
  toLabel,
  className,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  max?: string;
  fromLabel: string;
  toLabel: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <DateField
        value={from}
        max={to || max}
        onChange={(value) => onChange({ from: value, to: to && value && to < value ? value : to })}
        aria-label={fromLabel}
        className="w-36"
      />
      <span className="text-slate-400">–</span>
      <DateField
        value={to}
        min={from}
        max={max}
        onChange={(value) => onChange({ from: from && value && from > value ? value : from, to: value })}
        aria-label={toLabel}
        className="w-36"
      />
    </div>
  );
}
