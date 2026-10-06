import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchCurrentSubscription } from '../../lib/workspace-api';

/** In-app notice when the company subscription expires within 30 days (or is already expired). */
export const SubscriptionExpiryBanner: React.FC = () => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['workspace', 'subscription', 'current'],
    queryFn: fetchCurrentSubscription,
    staleTime: 60_000,
  });

  const data = query.data;
  if (!data?.subscription) return null;

  const status = data.subscription.status;
  const expiredOrSuspended = status === 'EXPIRED' || status === 'SUSPENDED';
  if (!expiredOrSuspended && !data.expiringSoon) return null;

  const days = data.daysRemaining;
  const message = expiredOrSuspended
    ? t('subscription.expiredBanner')
    : days === 0
      ? t('subscription.expiresTodayBanner')
      : days === 1
        ? t('subscription.expiresTomorrowBanner')
        : t('subscription.expiringSoonBanner', { days });

  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-2xl border border-ops-warn/25 bg-orange-50 px-4 py-3 font-sans text-[0.8rem] text-ops-warn print:hidden"
      data-testid="subscription-expiry-banner"
      role="status"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        <Link
          to="/app/settings/subscription"
          className="mt-1 inline-block font-medium text-ops-ink underline-offset-2 hover:underline"
        >
          {t('subscription.bannerCta')}
        </Link>
      </div>
    </div>
  );
};
