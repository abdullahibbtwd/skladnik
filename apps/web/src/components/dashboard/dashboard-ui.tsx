import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { expiryTone } from '../../lib/dashboard-data';

export const TONE_CLASS = {
  critical: 'border-ops-danger/20 bg-ops-danger/8 text-ops-danger',
  urgent: 'border-ops-warn/25 bg-ops-warn/8 text-ops-warn',
  warning: 'border-ops-warn/15 bg-orange-50 text-ops-warn',
  watch: 'border-ops-accent/20 bg-indigo-50 text-ops-accent',
  safe: 'border-ops-teal/20 bg-teal-50 text-ops-teal',
};

export const glassClass =
  'relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(30,27,75,0.12)]';

export function SpecularRim() {
  return <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="font-display text-[0.72rem] font-medium tracking-wider text-ops-accent uppercase">{eyebrow ?? t('app.workspace')}</p>
        <h1 className="mt-1 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">{title}</h1>
        <p className="mt-1 max-w-xl font-sans text-[0.8rem] text-slate-500">{description}</p>
      </div>
      {action && <div className="hidden lg:block">{action}</div>}
    </div>
  );
}

export function MetricGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 3 | 4;
}) {
  return (
    <section
      className={cn(
        'grid grid-cols-2 gap-2.5 sm:gap-4',
        columns === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3',
        columns === 3 && '[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1',
      )}
    >
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  iconColor = 'text-ops-accent',
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconColor?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        glassClass,
        'group p-4 text-left transition-all duration-200 hover:border-ops-accent/25 hover:shadow-[0_12px_28px_-12px_rgba(79,70,229,0.2)] sm:p-5',
        onClick && 'cursor-pointer active:scale-[0.98]',
      )}
    >
      <SpecularRim />
      <div className="flex items-center justify-between">
        <p className="font-display text-[0.72rem] font-medium tracking-wider text-slate-500 uppercase">{label}</p>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-ops-canvas transition-colors group-hover:border-ops-accent/20 group-hover:bg-indigo-50">
          <Icon size={15} className={cn('transition-colors', iconColor)} />
        </div>
      </div>
      <p className="mt-3 font-display text-[1.65rem] font-semibold tracking-tight text-ops-ink tabular-nums sm:text-[1.85rem]">{value}</p>
      <p className="mt-1.5 font-sans text-[0.74rem] text-slate-500">{hint}</p>
    </Tag>
  );
}

export function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-[0.82rem] font-medium transition-all duration-150 active:scale-[0.98]',
        primary
          ? 'bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover'
          : 'border border-slate-200 bg-white text-ops-ink shadow-sm hover:border-ops-accent/30 hover:bg-indigo-50/60 hover:text-ops-accent',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Icon size={15} strokeWidth={2.2} />
      <span>{label}</span>
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'shrink-0 rounded-lg border px-2.5 py-1 font-display text-[0.72rem] font-medium transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50',
        danger
          ? 'border-ops-danger/20 bg-ops-danger/5 text-ops-danger hover:bg-ops-danger/10'
          : 'border-slate-200 bg-white text-ops-ink hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent',
      )}
    >
      {children}
    </button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone =
    status === 'POSTED' || status === 'Posted'
      ? 'posted'
      : status === 'REVIEW' || status === 'Review'
        ? 'review'
        : status === 'CANCELLED'
          ? 'cancelled'
          : 'pending';
  const label =
    status === 'DRAFT'
      ? t('labels.documentStatus.DRAFT')
      : status === 'REVIEW' || status === 'Review'
        ? t('labels.documentStatus.REVIEW')
        : status === 'POSTED' || status === 'Posted'
          ? t('labels.documentStatus.POSTED')
          : status === 'CANCELLED'
            ? t('labels.documentStatus.CANCELLED')
            : status === 'Pending'
              ? t('ops.pending')
              : status;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-[0.66rem] font-medium',
        tone === 'posted' && 'border-ops-teal/20 bg-teal-50 text-ops-teal',
        tone === 'review' && 'border-ops-warn/20 bg-orange-50 text-ops-warn',
        tone === 'cancelled' && 'border-slate-200 bg-slate-50 text-slate-500',
        tone === 'pending' && 'border-ops-accent/20 bg-indigo-50 text-ops-accent',
      )}
    >
      <span
        className={cn(
          'size-1 rounded-full',
          tone === 'posted' && 'bg-ops-teal',
          tone === 'review' && 'bg-ops-warn',
          tone === 'cancelled' && 'bg-slate-400',
          tone === 'pending' && 'bg-ops-accent',
        )}
      />
      {label}
    </span>
  );
}

export function DaysPill({ days }: { days: number }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-0.5 font-mono text-[0.7rem] font-medium whitespace-nowrap', TONE_CLASS[expiryTone(days)])}>
      {days < 0 ? t('expiry.expired') : days === 0 ? t('expiry.today') : `${days}d`}
    </span>
  );
}

export function ExpiryChip({
  days,
  count,
  active,
  subLabel,
}: {
  days: number;
  count: number;
  active: boolean;
  subLabel: string;
}) {
  const tone = expiryTone(days);
  return (
    <div
      className={cn(
        'relative min-w-[5rem] flex-1 rounded-xl border p-3 transition-all duration-150',
        active ? TONE_CLASS[tone] : 'border-slate-200 bg-ops-canvas text-slate-400',
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn('font-display text-[1.25rem] font-semibold tracking-tight', active ? 'text-ops-ink' : 'text-slate-400')}>{count}</p>
        {active && days <= 3 && <span className="size-1.5 rounded-full bg-ops-danger" />}
        {active && days === 7 && <span className="size-1.5 rounded-full bg-ops-warn" />}
      </div>
      <p className="mt-0.5 font-display text-[0.68rem] font-medium opacity-80">
        ≤ {days}d · {subLabel}
      </p>
    </div>
  );
}

export function LiveBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-ops-canvas px-2.5 py-0.5 font-display text-[0.7rem] font-medium text-slate-500">
      {children}
    </span>
  );
}

export function GlassPanel({
  title,
  action,
  padded = true,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={glassClass}>
      <SpecularRim />
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-ops-canvas/60 px-4 py-3 sm:px-5 sm:py-3.5">
          <h2 className="font-display text-[0.92rem] font-semibold text-ops-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function tableHeadRowClass() {
  return 'border-b border-slate-100 bg-ops-canvas/70 text-[0.68rem] tracking-wider text-slate-500 uppercase';
}

export function tableRowClass() {
  return 'border-b border-slate-100 last:border-0 transition-colors hover:bg-ops-canvas/70';
}
