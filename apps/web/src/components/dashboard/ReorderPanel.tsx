import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Mail, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatEuro } from '../../lib/dashboard-data';
import type { ReorderSupplier } from '../../lib/workspace-api';
import { useReorderQuery, useSitesQuery } from '../../lib/workspace-session';
import { toast } from '../ui/Toaster';
import { useDashboard } from './dashboard-context';
import { GhostButton, GlassPanel, LiveBadge, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';

export const ReorderPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const reorderQuery = useReorderQuery(siteId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const suppliers = reorderQuery.data?.suppliers ?? [];
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);

  const qtyOf = (productId: string, suggested: number) => {
    const raw = quantities[productId];
    if (raw === undefined) return suggested;
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const orderLines = (supplier: ReorderSupplier) =>
    supplier.lines
      .map((line) => ({ ...line, qty: qtyOf(line.productId, line.suggestedQty) }))
      .filter((line) => line.qty > 0);

  const orderText = (supplier: ReorderSupplier) => {
    const lines = orderLines(supplier);
    return [
      t('reorder.textHeader', { site: siteName, date: new Date().toISOString().slice(0, 10) }),
      '',
      ...lines.map(
        (line) =>
          `• ${line.name}${line.supplierCode ? ` [${line.supplierCode}]` : ''} — ${qtyFormat.format(line.qty)} ${t(`labels.unit.${line.unit}`)}`,
      ),
      '',
      t('reorder.textFooter'),
    ].join('\n');
  };

  const copy = async (supplier: ReorderSupplier) => {
    try {
      await navigator.clipboard.writeText(orderText(supplier));
      toast.success(t('reorder.copied'));
    } catch {
      toast.error(t('reorder.copyFailed'));
    }
  };

  const mailto = (supplier: ReorderSupplier) =>
    `mailto:${supplier.partner?.email ?? ''}?subject=${encodeURIComponent(t('reorder.mailSubject', { site: siteName }))}&body=${encodeURIComponent(orderText(supplier))}`;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={siteName || undefined}
        title={t('reorder.title')}
        description={t('reorder.desc')}
        action={
          suppliers.length > 0 ? (
            <span className="print:hidden">
              <GhostButton onClick={() => window.print()}>
                <span className="inline-flex items-center gap-1">
                  <Printer size={13} /> {t('stocktake.print')}
                </span>
              </GhostButton>
            </span>
          ) : undefined
        }
      />

      {!siteId ? (
        <p className="font-sans text-sm text-slate-500">{t('stock.noSite')}</p>
      ) : reorderQuery.isPending ? (
        <p className="font-sans text-sm text-slate-500">{t('stock.loading')}</p>
      ) : reorderQuery.isError ? (
        <p className="font-sans text-sm text-ops-danger">{reorderQuery.error.message}</p>
      ) : suppliers.length === 0 ? (
        <GlassPanel>
          <p className="font-display text-[0.9rem] font-medium text-ops-ink">{t('reorder.nothing')}</p>
          <p className="mt-1 font-sans text-[0.8rem] text-slate-500">{t('reorder.nothingHint')}</p>
        </GlassPanel>
      ) : (
        suppliers.map((supplier) => {
          const lines = orderLines(supplier);
          const total = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
          return (
            <GlassPanel
              key={supplier.partner?.id ?? 'none'}
              padded={false}
              title={supplier.partner?.name ?? t('reorder.noSupplier')}
              action={<LiveBadge>{formatEuro(total)}</LiveBadge>}
            >
              {supplier.partner && (supplier.partner.phone || supplier.partner.email) && (
                <p className="border-b border-slate-100 px-4 py-2 font-mono text-[0.7rem] text-slate-500 sm:px-5">
                  {[supplier.partner.phone, supplier.partner.email].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left">
                  <thead>
                    <tr className={tableHeadRowClass()}>
                      <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('stocktake.item')}</th>
                      <th className="px-3 py-2.5 text-right font-display font-medium">{t('reorder.onHandMin')}</th>
                      <th className="px-3 py-2.5 text-right font-display font-medium">{t('reorder.order')}</th>
                      <th className="px-4 py-2.5 text-right font-display font-medium sm:px-5">{t('reorder.lineTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.lines.map((line) => {
                      const qty = qtyOf(line.productId, line.suggestedQty);
                      return (
                        <tr key={line.productId} className={tableRowClass()}>
                          <td className="px-4 py-2.5 sm:px-5">
                            <button
                              type="button"
                              onClick={() => navigate(`/app/stock/${line.productId}`)}
                              className="text-left font-display text-[0.84rem] text-ops-ink hover:text-ops-accent"
                            >
                              {line.name}
                            </button>
                            <p className="font-mono text-[0.66rem] text-slate-400">
                              {line.code}
                              {line.supplierCode ? ` · ${t('reorder.supplierCode')} ${line.supplierCode}` : ''} · {formatEuro(line.unitPrice)}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] whitespace-nowrap">
                            <span className={line.onHand <= 0 ? 'text-ops-danger' : 'text-ops-warn'}>{qtyFormat.format(line.onHand)}</span>
                            <span className="text-slate-400"> / {qtyFormat.format(line.minStock)}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              inputMode="decimal"
                              value={quantities[line.productId] ?? String(line.suggestedQty)}
                              onChange={(event) => setQuantities((current) => ({ ...current, [line.productId]: event.target.value }))}
                              aria-label={t('reorder.qtyFor', { name: line.name })}
                              className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-[0.86rem] outline-none focus:border-ops-teal/50"
                            />
                            <span className="ml-1 font-sans text-[0.7rem] text-slate-400">{t(`labels.unit.${line.unit}`)}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[0.8rem] whitespace-nowrap text-ops-ink sm:px-5">
                            {formatEuro(qty * line.unitPrice)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5 print:hidden">
                <GhostButton onClick={() => void copy(supplier)} disabled={lines.length === 0}>
                  <span className="inline-flex items-center gap-1">
                    <Copy size={13} /> {t('reorder.copy')}
                  </span>
                </GhostButton>
                {supplier.partner?.email && lines.length > 0 && (
                  <a
                    href={mailto(supplier)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-display text-[0.78rem] font-medium text-ops-ink hover:border-ops-accent/30"
                  >
                    <Mail size={13} /> {t('reorder.email')}
                  </a>
                )}
              </div>
            </GlassPanel>
          );
        })
      )}
    </div>
  );
};
