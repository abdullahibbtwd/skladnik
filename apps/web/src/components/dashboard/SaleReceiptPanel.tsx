import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatBusinessDateTime } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { formatDate, formatQty } from '../../lib/format';
import { useSaleQuery, useVoidSale } from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { GhostButton, GlassPanel, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';

export const SaleReceiptPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const saleQuery = useSaleQuery(id);
  const voidSale = useVoidSale(id);
  const sale = saleQuery.data?.sale;
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (saleQuery.isLoading) return <p className="font-sans text-[0.86rem] text-slate-500">{t('common.loading')}</p>;
  if (!sale) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-sans text-[0.86rem] text-ops-danger">{saleQuery.error?.message ?? t('sales.notFound')}</p>
        <GhostButton onClick={() => navigate('/app/sales')}>{t('sales.backToSales')}</GhostButton>
      </div>
    );
  }

  const isVoid = sale.kind === 'VOID';
  const showsCost = sale.cost !== undefined;

  const submitVoid = async () => {
    setError(null);
    try {
      await voidSale.mutateAsync(reason.trim() || undefined);
      toast.success(t('sales.voidDone', { number: sale.number }));
      setVoiding(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sales.voidFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <button
        type="button"
        onClick={() => navigate(sale.businessDate ? `/app/sales?date=${sale.businessDate}` : '/app/sales')}
        className="flex w-fit items-center gap-1.5 font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent"
      >
        <ArrowLeft size={15} />
        {t('sales.backToSales')}
      </button>

      <PageHeader
        eyebrow={sale.site.name}
        title={isVoid ? t('sales.voidTitle', { number: sale.number }) : t('sales.receiptTitle', { number: sale.number })}
        description={[
          sale.postedAt ? formatBusinessDateTime(sale.postedAt, i18n.language) : null,
          sale.cashier?.name,
          sale.paymentMethod ? t(`labels.paymentMethod.${sale.paymentMethod}`) : null,
          sale.paymentReference,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      {isVoid && sale.reversalOf && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-sans text-[0.82rem] text-rose-900">
          {t('sales.voidExplainer')}{' '}
          <Link to={`/app/sales/${sale.reversalOf.id}`} className="font-medium underline underline-offset-2">
            {sale.reversalOf.number}
          </Link>
          {sale.note && <span className="block text-rose-800/80">{t('sales.reasonLabel', { reason: sale.note })}</span>}
        </div>
      )}
      {sale.voidedBy && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-sans text-[0.82rem] text-amber-900">
          {t('sales.voidedBanner', {
            when: sale.voidedBy.postedAt ? formatBusinessDateTime(sale.voidedBy.postedAt, i18n.language) : '',
            by: sale.voidedBy.by?.name ?? '—',
          })}{' '}
          <Link to={`/app/sales/${sale.voidedBy.id}`} className="font-medium underline underline-offset-2">
            {sale.voidedBy.number}
          </Link>
          {sale.voidedBy.reason && <span className="block text-amber-800/80">{t('sales.reasonLabel', { reason: sale.voidedBy.reason })}</span>}
        </div>
      )}

      <GlassPanel padded={false} title={t('sales.linesTitle')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left">
            <thead>
              <tr className={tableHeadRowClass()}>
                <th className="px-4 py-2.5 font-medium sm:px-5">{t('sales.product')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('writeOff.qty')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('pos.unitPrice')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('sales.vat')}</th>
                {showsCost && <th className="px-3 py-2.5 text-right font-medium">{t('sales.cost')}</th>}
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">{t('pos.total')}</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((line) => (
                <tr key={line.id} className={tableRowClass()}>
                  <td className="px-4 py-2.5 sm:px-5">
                    <p className="font-display text-[0.84rem] text-ops-ink">{line.product?.name ?? '—'}</p>
                    <p className="font-mono text-[0.66rem] text-slate-400">
                      {line.product?.code}
                      {line.batch && ` · ${t('sales.batch', { number: line.batch.batchNumber })}`}
                      {line.batch?.expiryDate && ` · ${formatDate(line.batch.expiryDate, i18n.language)}`}
                    </p>
                    {line.issued && (
                      <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-slate-100 pl-2">
                        {line.issued.map((row, index) => (
                          <li key={`${row.productId}-${index}`} className="font-sans text-[0.7rem] text-slate-500">
                            {row.name} · {formatQty(row.quantity, i18n.language)} {t(`labels.unit.${row.unit}`)}
                            {row.batchNumber && ` · ${t('sales.batch', { number: row.batchNumber })}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[0.82rem] tabular-nums">
                    {formatQty(line.quantity, i18n.language)} {line.product ? t(`labels.unit.${line.product.unit}`) : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[0.82rem] tabular-nums">{formatEuro(line.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[0.76rem] text-slate-500">{line.vatRate}%</td>
                  {showsCost && (
                    <td className="px-3 py-2.5 text-right font-mono text-[0.78rem] text-slate-500 tabular-nums">{formatEuro(line.cost ?? 0)}</td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono text-[0.86rem] font-medium tabular-nums sm:px-5">{formatEuro(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-slate-100 bg-ops-canvas/60 px-4 py-4 sm:px-5">
          {sale.vat.map((row) => (
            <div key={row.rate} className="flex justify-between font-sans text-[0.78rem] text-slate-500">
              <span>{t('sales.vatRow', { rate: row.rate, net: formatEuro(row.net) })}</span>
              <span className="font-mono tabular-nums">{formatEuro(row.vat)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-[0.8rem] font-medium tracking-wide text-slate-500 uppercase">{isVoid ? t('sales.refunded') : t('pos.total')}</span>
            <span className={cn('font-display text-[1.4rem] font-semibold tabular-nums', isVoid ? 'text-ops-danger' : 'text-ops-ink')}>
              {isVoid ? `−${formatEuro(sale.total)}` : formatEuro(sale.total)}
            </span>
          </div>
          {sale.profit !== undefined && !isVoid && (
            <p className={cn('text-right font-sans text-[0.76rem]', sale.profit < 0 ? 'text-ops-danger' : 'text-ops-teal')}>
              {t('sales.receiptProfit', { profit: formatEuro(sale.profit), cost: formatEuro(sale.cost ?? 0) })}
            </p>
          )}
        </div>
      </GlassPanel>

      {sale.canVoid && (
        <GlassPanel>
          {voiding ? (
            <div className="flex flex-col gap-3">
              <p className="font-sans text-[0.84rem] text-slate-600">{t('sales.voidExplain')}</p>
              <div>
                <FieldLabel htmlFor="void-reason">{t('sales.voidReason')}</FieldLabel>
                <input
                  id="void-reason"
                  value={reason}
                  maxLength={500}
                  autoFocus
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t('sales.voidReasonPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-[0.65rem] font-sans text-[0.88rem] text-ops-ink outline-none focus:border-ops-teal/50 focus:bg-white"
                />
              </div>
              {error && <FieldError>{error}</FieldError>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitVoid()}
                  disabled={voidSale.isPending}
                  className="flex items-center gap-2 rounded-xl bg-ops-danger px-4 py-2.5 font-display text-[0.84rem] font-semibold text-white disabled:opacity-50"
                >
                  <Undo2 size={15} />
                  {voidSale.isPending ? t('common.saving') : t('sales.confirmVoid', { total: formatEuro(sale.total) })}
                </button>
                <GhostButton onClick={() => setVoiding(false)}>{t('common.cancel')}</GhostButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-[0.8rem] text-slate-500">{t('sales.voidHint')}</p>
              <GhostButton danger onClick={() => setVoiding(true)}>
                {t('sales.voidSale')}
              </GhostButton>
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
};
