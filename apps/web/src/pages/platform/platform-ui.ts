/** Shared light-theme classes for the platform console (aligned with tenant auth / dashboard). */

import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@skladnik/shared';
import type { TFunction } from 'i18next';
import type { SelectOption } from '../../components/ui/Select';

export const platformInputClass =
  'w-full rounded-xl border border-slate-200 bg-ops-canvas px-3 py-2.5 font-sans text-[0.88rem] text-ops-ink outline-none transition-colors placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30';

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
  if (status === 'ACTIVE' || status === 'TRIAL') {
    return 'border-ops-teal/20 bg-teal-50 text-ops-teal';
  }
  if (status === 'PENDING') {
    return 'border-ops-accent/20 bg-indigo-50 text-ops-accent';
  }
  if (status === 'SUSPENDED' || status === 'EXPIRED') {
    return 'border-ops-warn/25 bg-orange-50 text-ops-warn';
  }
  return 'border-ops-danger/20 bg-ops-danger/5 text-ops-danger';
}
