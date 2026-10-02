import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type SelectProps<T extends string> = {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** CAF-04: below 640px show a full-width list so unit names are not clipped to one letter. */
  expandOnNarrow?: boolean;
};

/** Leave room for the mobile dock + fixed action bars so menus open upward when needed. */
function bottomReserve() {
  if (typeof window === 'undefined') return 12;
  return window.matchMedia('(max-width: 767px)').matches ? 120 : 12;
}

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
  className,
  expandOnNarrow = false,
}: SelectProps<T>) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (!expandOnNarrow || typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 639px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [expandOnNarrow]);

  const selected = options.find((option) => option.value === value);

  const placeMenu = () => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = expandOnNarrow ? Math.max(rect.width, 240) : rect.width;
    const spaceBelow = window.innerHeight - rect.bottom - bottomReserve();
    const openUp = spaceBelow < 240 && rect.top > spaceBelow;
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      zIndex: 140,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    const onReposition = () => placeMenu();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (expandOnNarrow && narrow) {
    return (
      <div role="listbox" aria-label={placeholder} className={cn('flex flex-col gap-1', className)}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled || option.disabled}
              onClick={() => {
                if (disabled || option.disabled) return;
                onChange(option.value);
              }}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left font-display text-[0.84rem] font-medium',
                isSelected ? 'border-ops-teal bg-teal-50 text-ops-teal' : 'border-slate-200 bg-white text-ops-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-xl border bg-ops-canvas py-[0.7rem] pr-3 pl-3.5 text-left font-sans text-[0.88rem] outline-none transition-all',
          open
            ? 'border-ops-teal/50 bg-white text-ops-ink ring-1 ring-ops-teal/30 shadow-[0_8px_24px_-12px_rgba(13,148,136,0.35)]'
            : 'border-slate-200 text-ops-ink hover:border-ops-accent/30 hover:bg-white',
          disabled && 'cursor-not-allowed opacity-55 hover:border-slate-200 hover:bg-ops-canvas',
        )}
      >
        <span className={cn('min-w-0', expandOnNarrow ? 'whitespace-normal' : 'truncate', selected ? 'text-ops-ink' : 'text-slate-400')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180 text-ops-teal')}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-labelledby={triggerId}
            style={menuStyle}
            className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_18px_50px_-18px_rgba(30,27,75,0.35)]"
          >
            <div className="max-h-64 overflow-y-auto">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      option.disabled && 'cursor-not-allowed opacity-40',
                      isSelected
                        ? 'bg-teal-50 text-ops-teal'
                        : 'text-ops-ink hover:bg-ops-canvas',
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn('block font-display text-[0.84rem] font-medium', expandOnNarrow ? 'whitespace-normal' : 'truncate')}>
                        {option.label}
                      </span>
                      {option.hint && (
                        <span className="mt-0.5 block truncate font-sans text-[0.72rem] text-slate-400">{option.hint}</span>
                      )}
                    </span>
                    {isSelected && <Check size={15} strokeWidth={2.4} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
