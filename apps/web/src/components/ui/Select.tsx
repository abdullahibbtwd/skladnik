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
};

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
  className,
}: SelectProps<T>) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const selected = options.find((option) => option.value === value);

  const placeMenu = () => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = rect.width;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
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
        <span className={cn('min-w-0 truncate', selected ? 'text-ops-ink' : 'text-slate-400')}>
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
                      <span className="block truncate font-display text-[0.84rem] font-medium">{option.label}</span>
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
