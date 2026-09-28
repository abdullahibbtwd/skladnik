import React from 'react';
import { CheckCircle2, FileCode2, Timer } from 'lucide-react';
import { useLogout } from '../../lib/auth-session';
import { useRequiredUser } from '../../lib/auth-store';
import { useSitesQuery } from '../../lib/workspace-session';
import { useDashboard } from './dashboard-context';
import { ExpiringBatches } from './ExpiringBatches';
import { ExpiryChip, GhostButton, GlassPanel, LiveBadge, PageHeader, SpecularRim, glassClass } from './dashboard-ui';
import { cn } from '../../lib/cn';
import { useTranslation } from 'react-i18next';

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
          <ExpiryChip days={30} count={data.expiring[30]} active={data.expiring[30] > 0} subLabel={t('expiry.watch')} />
          <ExpiryChip days={14} count={data.expiring[14]} active={data.expiring[14] > 0} subLabel={t('expiry.plan')} />
          <ExpiryChip days={7} count={data.expiring[7]} active={data.expiring[7] > 0} subLabel={t('expiry.sellNow')} />
          <ExpiryChip days={3} count={data.expiring[3]} active={data.expiring[3] > 0} subLabel={t('expiry.pull')} />
        </div>
      </section>

      <GlassPanel
        padded={false}
        title={t('expiry.useFirst')}
        action={<LiveBadge>{t('expiry.batches', { count: data.fefoBoard.length })}</LiveBadge>}
      >
        <ExpiringBatches lines={data.fefoBoard} empty={data.stockReady ? t('empty.noExpiry') : t('stock.loading')} />
      </GlassPanel>
    </div>
  );
};

/** Honest placeholder for screens that have no data source yet. */
const ComingSoon: React.FC<{
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  body: string;
}> = ({ eyebrow, title, description, icon: Icon, body }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <GlassPanel title={t('common.comingSoon')}>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-ops-canvas text-ops-accent">
            <Icon size={16} />
          </div>
          <p className="max-w-xl font-sans text-[0.84rem] leading-relaxed text-slate-600">{body}</p>
        </div>
      </GlassPanel>
    </div>
  );
};

export const AuditPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ComingSoon
      eyebrow={t('pages.auditEyebrow')}
      title={t('pages.auditTitle')}
      description={t('pages.auditDesc')}
      icon={FileCode2}
      body={t('audit.comingSoon')}
    />
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
