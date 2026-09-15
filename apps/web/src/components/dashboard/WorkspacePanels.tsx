import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCode2,
  FileWarning,
  Package,
  PackageMinus,
  ShoppingBag,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { formatEuro, TODAYS_TURNOVER } from '../../lib/dashboard-data';
import { useLogout } from '../../lib/auth-session';
import { useRequiredUser } from '../../lib/auth-store';
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
  StatusPill,
  Toast,
  glassClass,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';
import { cn } from '../../lib/cn';

export const InvoicesPanel: React.FC = () => {
  const { data, onScan, markReviewed, toast } = useDashboard();
  const posted = data.operations.filter((op) => op.type === 'OCR intake' && op.status === 'Posted').length;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {toast && <Toast message={toast} />}
      <PageHeader
        title="Invoices"
        description="OCR intake and catalog matching before stock posts to the live ledger."
        action={<ActionButton icon={Camera} label="Photograph invoice" onClick={onScan} primary />}
      />

      <MetricGrid columns={3}>
        <MetricCard
          label="For review"
          value={String(data.pending.length)}
          hint={data.pending.length === 1 ? '1 document waiting' : `${data.pending.length} documents waiting`}
          icon={FileWarning}
          iconColor="text-ops-warn"
        />
        <MetricCard
          label="Posted intake"
          value={String(posted)}
          hint="OCR documents already posted"
          icon={ClipboardList}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label="Today's sales"
          value={formatEuro(TODAYS_TURNOVER)}
          hint="Linked POS turnover"
          icon={TrendingUp}
          iconColor="text-ops-teal"
        />
      </MetricGrid>

      <GlassPanel
        title="Waiting for review"
        action={<LiveBadge>{data.pending.length} open</LiveBadge>}
      >
        {data.pending.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 size={22} className="mx-auto mb-2 text-ops-teal" />
            <p className="font-display text-[0.88rem] font-medium text-ops-ink">Queue is clear</p>
            <p className="mt-1 font-sans text-[0.76rem] text-slate-400">No invoices waiting for catalog match.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {data.pending.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-ops-canvas p-3.5 transition-all hover:bg-slate-100 sm:p-4"
              >
                <div className="min-w-0">
                  <p className="font-display text-[0.88rem] font-medium text-ops-ink">{invoice.supplier}</p>
                  <p className="mt-0.5 font-mono text-[0.72rem] text-slate-500">
                    {invoice.number} · {invoice.total}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[0.74rem] text-ops-warn">
                    <span className="size-1.5 rounded-full bg-ops-warn" />
                    {invoice.reason}
                  </p>
                </div>
                <GhostButton onClick={() => markReviewed(invoice.id)}>Mark reviewed</GhostButton>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <GlassPanel padded={false} title="Recent intake">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left">
            <thead>
              <tr className={tableHeadRowClass()}>
                <th className="px-4 py-2.5 font-display font-medium">Type</th>
                <th className="px-3 py-2.5 font-display font-medium">Doc Ref</th>
                <th className="px-3 py-2.5 font-display font-medium">Time</th>
                <th className="px-4 py-2.5 text-right font-display font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.operations
                .filter((op) => op.type === 'OCR intake' || op.type === 'Goods received')
                .map((op) => (
                  <tr key={op.id} className={tableRowClass()}>
                    <td className="px-4 py-3 font-sans text-[0.8rem] text-ops-ink">{op.type}</td>
                    <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-400">{op.document}</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-slate-500">{op.time}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusPill status={op.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
};

export const InventoryPanel: React.FC = () => {
  const { data, toast } = useDashboard();
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {toast && <Toast message={toast} />}
      <PageHeader
        title="Inventory"
        description="Live batches for the selected site, including min-stock flags and FEFO age."
      />

      <MetricGrid columns={3}>
        <MetricCard
          label="Live batches"
          value={String(data.catalogCount)}
          hint="On-hand SKU lots at this site"
          icon={Package}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label="Stock value"
          value={formatEuro(data.stockValue)}
          hint="Active inventory at cost"
          icon={TrendingUp}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label="Low stock"
          value={String(data.lowStock.length)}
          hint="At or below min-stock"
          icon={AlertTriangle}
          iconColor="text-ops-danger"
        />
      </MetricGrid>

      <GlassPanel padded={false} title="Live catalog" action={<LiveBadge>{data.catalogCount} batches</LiveBadge>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left sm:min-w-[40rem]">
            <thead>
              <tr className={tableHeadRowClass()}>
                <th className="px-4 py-2.5 font-display font-medium sm:px-5">Item &amp; SKU</th>
                <th className="px-3 py-2.5 font-display font-medium">Batch</th>
                <th className="px-3 py-2.5 font-display font-medium">Qty</th>
                <th className="hidden px-3 py-2.5 font-display font-medium sm:table-cell">Value</th>
                <th className="px-4 py-2.5 text-right font-display font-medium sm:px-5">FEFO</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={`${line.sku}-${line.batch}`} className={tableRowClass()}>
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-display text-[0.82rem] font-medium text-ops-ink">{line.name}</p>
                    <p className="font-mono text-[0.66rem] text-slate-400">{line.sku}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.75rem] text-slate-600">{line.batch}</td>
                  <td className="px-3 py-3 font-mono text-[0.78rem]">
                    <span className="font-semibold text-ops-ink">{line.qty}</span>
                    {line.qty <= line.minStock && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-ops-danger/20 bg-rose-50 px-2 py-0.5 text-[0.66rem] font-medium text-ops-danger">
                        <span className="size-1 rounded-full bg-ops-danger" />
                        low
                      </span>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 font-mono text-[0.78rem] text-slate-600 sm:table-cell">
                    {formatEuro(line.qty * line.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right sm:px-5">
                    <DaysPill days={line.daysLeft} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
};

export const ExpiryPanel: React.FC = () => {
  const { data, writeOff, toast } = useDashboard();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {toast && <Toast message={toast} />}
      <PageHeader
        title="Expiry"
        description="30 / 14 / 7 / 3 day thresholds, oldest batch first for FEFO rotation."
      />

      <section className={cn(glassClass, 'p-4 sm:p-5')}>
        <SpecularRim />
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-ops-warn" />
            <h2 className="font-display text-[0.92rem] font-semibold text-ops-ink">Actionable FEFO Board</h2>
          </div>
          <LiveBadge>Live Rotation</LiveBadge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2.5">
          <ExpiryChip days={30} count={data.expiring[30]} active={data.expiring[30] > 0} subLabel="Safe" />
          <ExpiryChip days={14} count={data.expiring[14]} active={data.expiring[14] > 0} subLabel="Notice" />
          <ExpiryChip days={7} count={data.expiring[7]} active={data.expiring[7] > 0} subLabel="Urgent" />
          <ExpiryChip days={3} count={data.expiring[3]} active={data.expiring[3] > 0} subLabel="Critical" />
        </div>
      </section>

      <GlassPanel padded={false} title="Expiring soon (FEFO)" action={<LiveBadge>{data.fefoBoard.length} batches</LiveBadge>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left sm:min-w-[32rem]">
            <thead>
              <tr className={tableHeadRowClass()}>
                <th className="px-4 py-2.5 font-display font-medium sm:px-5">Item &amp; SKU</th>
                <th className="px-3 py-2.5 font-display font-medium">Batch</th>
                <th className="px-3 py-2.5 font-display font-medium">Expires</th>
                <th className="hidden px-4 py-2.5 text-right font-display font-medium sm:table-cell sm:px-5">Action</th>
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
                    <GhostButton onClick={() => writeOff(line.sku, line.batch)}>Write-off</GhostButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
};

export const PosPanel: React.FC = () => {
  const { data, toast } = useDashboard();
  const [sold, setSold] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {(toast || sold) && <Toast message={sold ? `Recorded sale: ${sold}` : toast ?? ''} />}
      <PageHeader
        eyebrow="Front of house"
        title="Sales POS"
        description="Quick till for the current site. Stage 1 will post real stock movements."
      />

      <MetricGrid columns={3}>
        <MetricCard
          label="Today's sales"
          value={formatEuro(TODAYS_TURNOVER)}
          hint="POS turnover since 06:00"
          icon={TrendingUp}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label="On-hand SKUs"
          value={String(data.catalogCount)}
          hint="Available for the till"
          icon={Package}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label="Last ticket"
          value={sold ? sold.split(' · ')[1] ?? '—' : '—'}
          hint={sold ? sold.split(' · ')[0] : 'Tap a product to record'}
          icon={ShoppingBag}
          iconColor="text-ops-accent"
        />
      </MetricGrid>

      <GlassPanel title="Quick till" action={<LiveBadge>Tap to sell</LiveBadge>}>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.lines.slice(0, 9).map((line) => (
            <button
              key={`${line.sku}-${line.batch}`}
              type="button"
              onClick={() => setSold(`${line.name} · ${formatEuro(line.unitPrice)}`)}
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-ops-canvas p-4 text-left transition-all duration-200 hover:border-ops-accent/30 hover:bg-indigo-50/50 active:scale-[0.98]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[0.86rem] font-medium text-ops-ink transition-colors group-hover:text-ops-accent">{line.name}</p>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-ops-accent transition-colors group-hover:border-ops-accent/30">
                  <ShoppingBag size={13} />
                </div>
              </div>
              <p className="mt-1 font-mono text-[0.66rem] text-slate-500">{line.sku}</p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-2.5">
                <p className="font-display text-[1.05rem] font-semibold tabular-nums text-ops-ink">{formatEuro(line.unitPrice)}</p>
                <span className="font-sans text-[0.72rem] text-slate-400">On hand {line.qty}</span>
              </div>
            </button>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
};

export const AuditPanel: React.FC = () => {
  const { data, toast } = useDashboard();
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
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {toast && <Toast message={toast} />}
      <PageHeader
        eyebrow="Compliance"
        title="Audit XML"
        description="Export an Annex 38 snapshot for the selected site. Preview until the live ledger API is wired."
        action={
          <ActionButton
            icon={downloaded ? CheckCircle2 : Download}
            label={downloaded ? 'Downloaded' : 'Export Annex 38 XML'}
            onClick={downloadXml}
            primary
          />
        }
      />

      <MetricGrid columns={3}>
        <MetricCard
          label="Lines in export"
          value={String(data.lines.length)}
          hint="Stock rows in the snapshot"
          icon={FileCode2}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label="Expiring <7 days"
          value={String(data.expiring[7])}
          hint="Included FEFO exceptions"
          icon={Timer}
          iconColor="text-ops-warn"
        />
        <MetricCard
          label="Write-offs"
          value={String(data.operations.filter((op) => op.type === 'Write-off').length)}
          hint="Recent disposal documents"
          icon={PackageMinus}
          iconColor="text-ops-danger"
        />
      </MetricGrid>

      <GlassPanel title="Annex 38 snapshot" action={<LiveBadge>AUDIT_COMPLIANT</LiveBadge>}>
        <p className="max-w-xl font-sans text-[0.84rem] leading-relaxed text-slate-600">
          The file includes store identity, owner email, and every live batch at the current site — SKU, quantity, FEFO age, and source invoice.
        </p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-ops-canvas px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-slate-500">
          <p>Store · {user.companyName}</p>
          <p>Operator · {user.email}</p>
          <p>Lines · {data.lines.length}</p>
          <p>Generated · local preview</p>
        </div>
      </GlassPanel>
    </div>
  );
};

export const SettingsPanel: React.FC = () => {
  const { siteId, setSiteId, toast } = useDashboard();
  const user = useRequiredUser();
  const logout = useLogout();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {toast && <Toast message={toast} />}
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Workspace defaults for this terminal. Company and user CRUD arrives in Stage 1."
      />

      <GlassPanel title="Signed-in account">
        <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Operator', user.name],
            ['Email', user.email],
            ['Company', user.companyName],
            ['Role', user.role.replaceAll('_', ' ')],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-ops-canvas p-3.5">
              <dt className="font-display text-[0.72rem] font-medium tracking-wider text-slate-500 uppercase">{label}</dt>
              <dd className="mt-1.5 truncate font-display text-[0.88rem] font-medium text-ops-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <GhostButton danger onClick={() => logout.mutate()}>
            Log out
          </GhostButton>
        </div>
      </GlassPanel>

      <GlassPanel title="Active site" action={<LiveBadge>Controls the workspace</LiveBadge>}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(
            [
              { id: 'central', name: 'Store #1 - Central', copy: 'Front counter and refrigerated storage' },
              { id: 'warehouse', name: 'Warehouse', copy: 'Bulk dry storage and receiving' },
            ] as const
          ).map((site) => {
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
                  <p className="mt-0.5 font-sans text-[0.74rem] text-slate-400">{site.copy}</p>
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
