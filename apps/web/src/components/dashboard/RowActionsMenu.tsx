import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

export type RowAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** Compact ⋯ menu for row actions on narrow screens (and optional desktop use). */
export function RowActionsMenu({ actions, align = 'end' }: { actions: RowAction[]; align?: 'start' | 'end' }) {
  const { t } = useTranslation();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const enabled = actions.filter((action) => !action.disabled);
  if (enabled.length === 0) return null;

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 11.5 * 16;
    const left = align === 'end' ? Math.min(rect.right - width, window.innerWidth - width - 8) : Math.max(8, rect.left);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < 160 && rect.top > spaceBelow;
    setStyle({
      position: 'fixed',
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: Math.max(8, left),
      width,
      zIndex: 150,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onReposition = () => place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, align]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('common.moreActions')}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-ops-accent/30 hover:text-ops-accent"
      >
        <MoreHorizontal size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={style}
            className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(30,27,75,0.35)]"
          >
            {enabled.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  action.onClick();
                }}
                className={cn(
                  'flex w-full items-center rounded-lg px-3 py-2 text-left font-display text-[0.8rem] font-medium transition-colors',
                  action.danger ? 'text-ops-danger hover:bg-rose-50' : 'text-ops-ink hover:bg-ops-canvas',
                )}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
