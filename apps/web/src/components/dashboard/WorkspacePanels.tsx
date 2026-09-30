import React from 'react';
import { CheckCircle2, Timer } from 'lucide-react';
import { useLogout } from '../../lib/auth-session';
import { useRequiredUser } from '../../lib/auth-store';
import { useSitesQuery } from '../../lib/workspace-session';
import { useDashboard } from './dashboard-context';
import { ExpiringBatches } from './ExpiringBatches';
import { ExpiryChip, GhostButton, GlassPanel, LiveBadge, PageHeader, SpecularRim, glassClass } from './dashboard-ui';
import { cn } from '../../lib/cn';
import { useTranslation } from 'react-i18next';

const EXPIRY_CHIP_LABELS = ['expiry.watch', 'expiry.plan', 'expiry.sellNow', 'expiry.pull'] as const;

export const ExpiryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useDashboard();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader title={t('pages.expiryTitle')} description={t('pages.expiryDesc')} />

      <section className={cn(glassClass, 'p-4 sm:p-5')}>
        <SpecularRim />
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-ops-warn" />
            <h2 className="font-display text-[0.92rem] font-semibold text-ops-ink">{t('expiry.windows')}</h2>
          </div>
          {data.expired > 0 && <LiveBadge>{t('expiry.expiredCount', { count: data.expired })}</LiveBadge>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2.5">
          {data.expiring.map(({ days, count }, index) => (
            <ExpiryChip key={index} days={days} count={count} active={count > 0} subLabel={t(EXPIRY_CHIP_LABELS[index])} />
          ))}
        </div>
      </section>

      {data.expired > 0 && (
        <GlassPanel
          padded={false}
          title={t('expiry.expiredWriteOff')}
          action={<LiveBadge>{t('expiry.batches', { count: data.expiredBoard.length })}</LiveBadge>}
        >
          <ExpiringBatches lines={data.expiredBoard} empty={t('empty.noExpiry')} />
        </GlassPanel>
      )}

      <GlassPanel
        padded={false}
        title={t('expiry.useFirst')}
        action={<LiveBadge>{t('expiry.batches', { count: data.useFirstBoard.length })}</LiveBadge>}
      >
        <ExpiringBatches lines={data.useFirstBoard} empty={data.stockReady ? t('empty.noExpiry') : t('stock.loading')} />
      </GlassPanel>
    </div>
  );
};

export const SettingsAccountPanel: React.FC = () => {
  const { t } = useTranslation();
  const { siteId, setSiteId } = useDashboard();
  const user = useRequiredUser();
  const logout = useLogout();
  const sitesQuery = useSitesQuery();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={t('pages.settingsEyebrow')}
        title={t('pages.settingsTitle')}
        description={t('pages.settingsDesc')}
      />

      <GlassPanel title={t('account.signedIn')}>
        <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t('account.operator'), user.name],
            [t('common.email'), user.email],
            [t('account.company'), user.companyName],
            [t('account.role'), t(`labels.role.${user.role}`)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-ops-canvas p-3.5">
              <dt className="font-display text-[0.72rem] font-medium tracking-wider text-slate-500 uppercase">{label}</dt>
              <dd className="mt-1.5 truncate font-display text-[0.88rem] font-medium text-ops-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <GhostButton danger onClick={() => logout.mutate()}>
            {t('account.logOut')}
          </GhostButton>
        </div>
      </GlassPanel>

      <GlassPanel title={t('account.activeSite')} action={<LiveBadge>{t('account.controlsWorkspace')}</LiveBadge>}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(sitesQuery.data?.sites ?? [])
            .filter((site) => site.isActive)
            .map((site) => {
              const active = siteId === site.id;
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => setSiteId(site.id)}
                  className={cn(
                    'flex items-center justify-between rounded-xl border p-3.5 text-left transition-all',
                    active
                      ? 'border-ops-accent/25 bg-indigo-50 text-ops-ink'
                      : 'border-slate-200 bg-ops-canvas text-slate-600 hover:border-ops-accent/20 hover:bg-white',
                  )}
                >
                  <div>
                    <p className="font-display text-[0.86rem] font-medium">{site.name}</p>
                    <p className="mt-0.5 font-sans text-[0.74rem] text-slate-400">{t(`labels.siteType.${site.type}`)}</p>
                  </div>
                  {active && <CheckCircle2 size={16} className="shrink-0 text-ops-accent" />}
                </button>
              );
            })}
        </div>
      </GlassPanel>
    </div>
  );
};
