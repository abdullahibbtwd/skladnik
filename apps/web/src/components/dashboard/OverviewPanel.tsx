import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardList,
  Package,
  PackageMinus,
  Timer,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { formatEuro, TODAYS_TURNOVER } from '../../lib/dashboard-data';
import { useDashboard } from './dashboard-context';
import {
  ActionButton,
  DaysPill,
  ExpiryChip,
  GhostButton,
  GlassPanel,
  LiveBadge,
  MetricCard,
  SpecularRim,
  StatusPill,
  Toast,
  glassClass,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';

export const OverviewPanel: React.FC = () => {
  const navigate = useNavigate();
  const { data, onScan, writeOff, toast } = useDashboard();
  const firstWriteOff = data.fefoBoard[0];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {toast && <Toast message={toast} />}

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Today's sales"
          value={formatEuro(TODAYS_TURNOVER)}
          hint="POS turnover since 06:00"
          icon={TrendingUp}
          iconColor="text-ops-teal"
        />
        <MetricCard
          label="Active stock value"
          value={formatEuro(data.stockValue)}
          hint={`${data.catalogCount} live catalog batches`}
          icon={Package}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label="Pending invoices"
          value={String(data.pending.length)}
          hint={data.pending.length === 1 ? '1 invoice waiting' : `${data.pending.length} invoices waiting`}
          icon={ClipboardList}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label="Expiring <7 days"
          value={String(data.expiring[7])}
          hint="FEFO batches needing action"
          icon={Timer}
          iconColor="text-ops-warn"
        />
      </section>

      <section className={cnPanel()}>
        <SpecularRim />
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-ops-warn" />
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
        {data.lowStock.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-[0.7rem] font-medium tracking-wider text-slate-500 uppercase">Min Stock Alerts:</span>
            {data.lowStock.slice(0, 4).map((line) => (
              <span
                key={`${line.sku}-${line.batch}`}
                className="flex items-center gap-1.5 rounded-full border border-ops-danger/15 bg-rose-50 px-2.5 py-0.5 font-sans text-[0.72rem] text-ops-ink"
              >
                <span className="size-1 rounded-full bg-ops-danger" />
                <span>{line.name}</span>
                <span className="font-mono text-slate-500">
                  ({line.qty}/{line.minStock})
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-2 sm:gap-2.5">
        <ActionButton icon={Camera} label="Photograph invoice" onClick={onScan} primary />
        <ActionButton icon={Truck} label="Receive goods" onClick={() => navigate('/app/invoices')} />
        <ActionButton
          icon={PackageMinus}
          label="Write-off"
          onClick={() => (firstWriteOff ? writeOff(firstWriteOff.sku, firstWriteOff.batch) : navigate('/app/expiry'))}
        />
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <GlassPanel
          padded={false}
          title="Expiring Soon (FEFO)"
          action={
            <button
              type="button"
              onClick={() => navigate('/app/expiry')}
              className="inline-flex items-center gap-1 font-display text-[0.75rem] font-medium text-ops-accent transition-colors hover:text-ops-ink"
            >
              Open expiry board
              <ArrowRight size={13} />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-display font-medium">Item &amp; SKU</th>
                  <th className="px-3 py-2.5 font-display font-medium">Batch</th>
                  <th className="px-3 py-2.5 font-display font-medium">Expires</th>
                  <th className="px-4 py-2.5 text-right font-display font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.fefoBoard.slice(0, 6).map((line) => (
                  <tr key={`${line.sku}-${line.batch}`} className={tableRowClass()}>
                    <td className="px-4 py-3">
                      <p className="font-display text-[0.82rem] font-medium text-ops-ink">{line.name}</p>
                      <p className="font-mono text-[0.66rem] text-slate-500">{line.sku}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.75rem] text-slate-600">{line.batch}</td>
                    <td className="px-3 py-3">
                      <DaysPill days={line.daysLeft} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <GhostButton onClick={() => writeOff(line.sku, line.batch)}>Write-off</GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>

        <GlassPanel
          padded={false}
          title="Recent Operations"
          action={
            <button
              type="button"
              onClick={() => navigate('/app/invoices')}
              className="inline-flex items-center gap-1 font-display text-[0.75rem] font-medium text-ops-accent transition-colors hover:text-ops-ink"
            >
              <ClipboardList size={13} />
              Invoices
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-display font-medium">Type</th>
                  <th className="px-3 py-2.5 font-display font-medium">Doc Ref</th>
                  <th className="px-3 py-2.5 font-display font-medium">Time</th>
                  <th className="px-4 py-2.5 text-right font-display font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.operations.map((op) => (
                  <tr key={op.id} className={tableRowClass()}>
                    <td className="px-4 py-3 font-sans text-[0.8rem] text-ops-ink">{op.type}</td>
                    <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-500">{op.document}</td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-slate-400">{op.time}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusPill status={op.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </section>
    </div>
  );
};

function cnPanel() {
  return `${glassClass} p-4 sm:p-5`;
}
