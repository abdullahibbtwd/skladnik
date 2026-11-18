/** Shared light-theme classes for the platform console (aligned with tenant auth / dashboard). */

import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@skladnik/shared';
import type { TFunction } from 'i18next';
import type { SelectOption } from '../../components/ui/Select';

export const platformInputClass =
  'w-full rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2.5 font-sans text-[0.88rem] text-ops-ink outline-none transition-colors placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30';

export const platformInputErrorClass =
  'w-full rounded-xl border border-ops-danger/50 bg-ops-danger/5 px-3 py-2.5 font-sans text-[0.88rem] text-ops-ink outline-none transition-colors placeholder:text-slate-400 focus:border-ops-danger focus:bg-white focus:ring-1 focus:ring-ops-danger/30';

export const platformFieldErrorClass = 'mt-1 font-sans text-[0.72rem] text-ops-danger';

export const platformLabelClass = 'mb-1.5 block font-display text-[0.78rem] font-medium text-slate-500';

export const platformPrimaryBtnClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-ops-teal px-4 py-2.5 font-display text-[0.9rem] font-medium text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)] transition-all hover:bg-ops-teal-hover disabled:cursor-not-allowed disabled:opacity-60';

export const platformSecondaryBtnClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-display text-[0.84rem] font-medium text-ops-ink shadow-sm transition-all hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent disabled:opacity-60';

export const platformPanelClass =
  'relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(30,27,75,0.12)]';

export const platformErrorClass =
  'rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3 py-2.5 font-sans text-sm text-ops-danger';

export const platformWarnClass =
  'rounded-xl border border-ops-warn/25 bg-orange-50 px-3 py-2.5 font-sans text-sm text-ops-warn';

/** Suggested deal defaults when an operator picks a plan in the create form. Editable after. */
export const PLATFORM_PLAN_PRESETS: Record<
  SubscriptionPlan,
  { maxUsers: number; termMonths: number; priceMajor: string; currency: string }
> = {
  STARTER: { maxUsers: 5, termMonths: 12, priceMajor: '120.00', currency: 'EUR' },
  PRO: { maxUsers: 15, termMonths: 12, priceMajor: '299.00', currency: 'EUR' },
  MULTI_LOCATION: { maxUsers: 50, termMonths: 12, priceMajor: '599.00', currency: 'EUR' },
};

export function platformPlanSelectOptions(t: TFunction): SelectOption<SubscriptionPlan>[] {
  return SUBSCRIPTION_PLANS.map((value) => {
    const preset = PLATFORM_PLAN_PRESETS[value];
    return {
      value,
      label: t(`platform.subscriptions.plans.${value}.label`),
      hint: t(`platform.subscriptions.plans.${value}.hint`, {
        users: preset.maxUsers,
        price: preset.priceMajor,
        months: preset.termMonths,
        currency: preset.currency,
      }),
    };
  });
}

export function platformStatusTone(status: string): string {
  if (status === 'ACTIVE' || status === 'TRIAL' || status === 'CONTACTED') {
    return 'border-ops-teal/20 bg-teal-50 text-ops-teal';
  }
  if (status === 'PENDING' || status === 'QUEUED' || status === 'NEW') {
    return 'border-ops-accent/20 bg-indigo-50 text-ops-accent';
  }
  if (status === 'SUSPENDED' || status === 'EXPIRED' || status === 'SUPERSEDED' || status === 'CLOSED') {
    return 'border-ops-warn/25 bg-orange-50 text-ops-warn';
  }
  return 'border-ops-danger/20 bg-ops-danger/5 text-ops-danger';
}

export function formatRelativeTime(iso: string, locale = 'en'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith('bg') ? 'bg' : 'en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 48) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  return rtf.format(diffMonth, 'month');
}
