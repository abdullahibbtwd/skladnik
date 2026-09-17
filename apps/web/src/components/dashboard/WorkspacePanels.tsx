import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  Package,
  PackageMinus,
  ShoppingBag,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { formatEuro } from '../../lib/dashboard-data';
import { useLogout } from '../../lib/auth-session';
import { useRequiredUser } from '../../lib/auth-store';
import { useSitesQuery } from '../../lib/workspace-session';
import { useDashboard } from './dashboard-context';
import {
  ActionButton,
  DaysPill,
  ExpiryChip,
  GhostButton,
  GlassPanel,
  LiveBadge,
  MetricCard,
  MetricGrid,
  PageHeader,
  SpecularRim,
  glassClass,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';
import { cn } from '../../lib/cn';
import { toast } from '../ui/Toaster';
import { useTranslation } from 'react-i18next';

export const ExpiryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { data, writeOff } = useDashboard();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title={t('pages.expiryTitle')}
        description={t('pages.expiryDesc')}
      />

      <section className={cn(glassClass, 'p-4 sm:p-5')}>
        <SpecularRim />
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-ops-warn" />
            <h2 className="font-display text-[0.92rem] font-semibold text-ops-ink">{t('overview.fefoBoard')}</h2>
          </div>
          <LiveBadge>{t('overview.liveRotation')}</LiveBadge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2.5">
          <ExpiryChip days={30} count={data.expiring[30]} active={data.expiring[30] > 0} subLabel={t('overview.safe')} />
          <ExpiryChip days={14} count={data.expiring[14]} active={data.expiring[14] > 0} subLabel={t('overview.notice')} />
          <ExpiryChip days={7} count={data.expiring[7]} active={data.expiring[7] > 0} subLabel={t('overview.urgent')} />
          <ExpiryChip days={3} count={data.expiring[3]} active={data.expiring[3] > 0} subLabel={t('overview.critical')} />
        </div>
      </section>

      <GlassPanel padded={false} title={t('expiry.expiringSoon')} action={<LiveBadge>{t('expiry.batches', { count: data.fefoBoard.length })}</LiveBadge>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left sm:min-w-[32rem]">
            <thead>
              <tr className={tableHeadRowClass()}>
                <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('expiry.itemSku')}</th>
                <th className="px-3 py-2.5 font-display font-medium">{t('expiry.batch')}</th>
                <th className="px-3 py-2.5 font-display font-medium">{t('expiry.expires')}</th>
                <th className="hidden px-4 py-2.5 text-right font-display font-medium sm:table-cell sm:px-5">{t('expiry.action')}</th>
              </tr>
            </thead>
            <tbody>
              {data.fefoBoard.map((line) => (
                <tr key={`${line.sku}-${line.batch}`} className={tableRowClass()}>
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-display text-[0.82rem] font-medium text-ops-ink">{line.name}</p>
                    <p className="font-mono text-[0.66rem] text-slate-400">{line.sku}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.75rem] text-slate-600">{line.batch}</td>
                  <td className="px-3 py-3">
                    <DaysPill days={line.daysLeft} />
                  </td>
                  <td className="hidden px-4 py-3 text-right sm:table-cell sm:px-5">
                    <GhostButton onClick={() => writeOff(line.sku, line.batch)}>{t('expiry.writeOff')}</GhostButton>
                  </td>
                </tr>
              ))}
              {data.fefoBoard.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center font-sans text-[0.8rem] text-slate-500 sm:px-5">
                    {t('empty.noExpiry')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
};

export const PosPanel: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useDashboard();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={t('pages.posEyebrow')}
        title={t('pages.posTitle')}
        description={t('pages.posDesc')}
      />

      <MetricGrid columns={3}>
        <MetricCard
          label={t('pos.todaysSales')}
          value={formatEuro(0)}
          hint={t('overview.todaysSalesHint')}
          icon={TrendingUp}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label={t('pos.onHand')}
          value={String(data.catalogCount)}
          hint={t('pos.availableTill')}
          icon={Package}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label={t('pos.lastTicket')}
          value="—"
          hint={t('pos.tapToRecord')}
          icon={ShoppingBag}
          iconColor="text-ops-accent"
        />
      </MetricGrid>

      <GlassPanel title={t('pos.quickTill')} action={<LiveBadge>{t('pos.tapToSell')}</LiveBadge>}>
        {data.lines.length === 0 ? (
          <p className="px-1 py-6 text-center font-sans text-[0.84rem] text-slate-500">{t('empty.pos')}</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {data.lines.slice(0, 9).map((line) => (
              <div
                key={`${line.sku}-${line.batch}`}
                className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-ops-canvas p-4 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-[0.86rem] font-medium text-ops-ink">{line.name}</p>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-ops-accent">
                    <ShoppingBag size={13} />
                  </div>
                </div>
                <p className="mt-1 font-mono text-[0.66rem] text-slate-500">{line.sku}</p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-2.5">
                  <p className="font-display text-[1.05rem] font-semibold tabular-nums text-ops-ink">{formatEuro(line.unitPrice)}</p>
                  <span className="font-sans text-[0.72rem] text-slate-400">{t('pos.onHandQty', { qty: line.qty })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
};

export const AuditPanel: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const user = useRequiredUser();
  const [downloaded, setDownloaded] = useState(false);

  const downloadXml = () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Annex38AuditLog schemaVersion="2026.1" xmlns="urn:skladnik:annex38">
  <Header>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Application>Skladnik Retail POS Suite v2.4</Application>
    <StoreName>${user.companyName}</StoreName>
    <OwnerEmail>${user.email}</OwnerEmail>
    <Status>AUDIT_COMPLIANT</Status>
  </Header>
  <InventorySnapshot totalLines="${data.lines.length}">
${data.lines
  .map(
    (line) =>
      `    <StockItem sku="${line.sku}" name="${line.name}" qty="${line.qty}" batch="${line.batch}" daysLeft="${line.daysLeft}" invoice="${line.invoice}" />`,
  )
  .join('\n')}
  </InventorySnapshot>
</Annex38AuditLog>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annex38_${user.companyName.toLowerCase().replace(/\s+/g, '_')}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    toast.success(t('audit.downloaded'));
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={t('pages.auditEyebrow')}
        title={t('pages.auditTitle')}
        description={t('pages.auditDesc')}
        action={
          <ActionButton
            icon={downloaded ? CheckCircle2 : Download}
            label={downloaded ? t('audit.downloadedLabel') : t('audit.export')}
            onClick={downloadXml}
            primary
          />
        }
      />

      <MetricGrid columns={3}>
        <MetricCard
          label={t('audit.linesInExport')}
          value={String(data.lines.length)}
          hint={t('audit.linesHint')}
          icon={FileCode2}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label={t('audit.expiring7')}
          value={String(data.expiring[7])}
          hint={t('audit.expiringHint')}
          icon={Timer}
          iconColor="text-ops-warn"
        />
        <MetricCard
          label={t('audit.writeOffs')}
          value="0"
          hint={t('audit.writeOffHint')}
          icon={PackageMinus}
          iconColor="text-ops-danger"
        />
      </MetricGrid>

      <GlassPanel title={t('audit.snapshot')} action={<LiveBadge>AUDIT_COMPLIANT</LiveBadge>}>
        <p className="max-w-xl font-sans text-[0.84rem] leading-relaxed text-slate-600">
          {data.lines.length === 0 ? t('empty.audit') : t('audit.snapshotBody')}
        </p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-ops-canvas px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-slate-500">
          <p>{t('audit.store')} · {user.companyName}</p>
          <p>{t('audit.operator')} · {user.email}</p>
          <p>{t('audit.linesLabel')} · {data.lines.length}</p>
          <p>{t('audit.generated')}</p>
        </div>
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
