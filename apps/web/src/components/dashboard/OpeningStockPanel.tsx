import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthRole } from '../../lib/auth-store';
import { formatEuro } from '../../lib/dashboard-data';
import { addDocumentLine, createDocument, postDocument, submitDocument, type ProductRecord } from '../../lib/workspace-api';
import { useSitesQuery } from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { confirm } from '../ui/Dialog';
import { toast } from '../ui/Toaster';
import { CatalogProductSearch } from './CatalogProductSearch';
import { useDashboard } from './dashboard-context';
import { GlassPanel, PageHeader, glassClass } from './dashboard-ui';
import { cn } from '../../lib/cn';

type Row = { key: string; product: ProductRecord; batchNumber: string; expiryDate: string; qty: string; unitCost: string };

const fieldClass =
  'h-10 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[0.86rem] text-ops-ink outline-none focus:border-ops-teal/50';

function num(value: string) {
  return Number(value.trim().replace(',', '.'));
}

export const OpeningStockPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT' || role === 'SITE_MANAGER';
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const [rows, setRows] = useState<Row[]>([]);
  const [issuedOn, setIssuedOn] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const checked = rows.map((row) => {
    const qty = num(row.qty);
    const unitCost = num(row.unitCost);
    const problem = !(qty > 0)
      ? t('writeOff.qtyRequired')
      : !(unitCost >= 0) || row.unitCost.trim() === ''
        ? t('opening.costRequired')
        : row.product.batchTracking && (!row.batchNumber.trim() || !row.expiryDate)
          ? t('stocktake.batchRequired')
          : null;
    return { row, qty, unitCost, problem };
  });
  const total = checked.reduce((sum, entry) => sum + (entry.qty > 0 && entry.unitCost >= 0 ? entry.qty * entry.unitCost : 0), 0);
  const ready = canWrite && Boolean(siteId) && checked.length > 0 && checked.every((entry) => !entry.problem);

  const submit = async () => {
    if (!ready || busy) return;
    setError(null);
    const ok = await confirm({
      title: t('opening.confirmTitle', { count: checked.length }),
      description: t('opening.confirmBody', { site: siteName, total: formatEuro(total), date: issuedOn }),
      confirmLabel: t('opening.submit'),
    });
    if (!ok) return;
    setBusy(true);
    let documentId: string | null = null;
    try {
      const created = await createDocument({
        type: 'OPENING_BALANCE',
        siteId,
        documentNumber: `OB-${Date.now()}`,
        issuedOn,
      });
      documentId = created.document.id;
      for (const { row, qty, unitCost } of checked) {
        await addDocumentLine(documentId, {
          productId: row.product.id,
          quantity: qty,
          unitPrice: unitCost,
          ...(row.product.batchTracking ? { batchNumber: row.batchNumber.trim(), expiryDate: row.expiryDate } : {}),
        });
      }
      await submitDocument(documentId);
      await postDocument(documentId);
      toast.success(t('opening.done', { count: checked.length }));
      navigate(`/app/invoices/${documentId}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('opening.failed');
      if (documentId) {
        toast.error(t('writeOff.savedAsDraft', { message }));
        navigate(`/app/invoices/${documentId}`, { replace: true });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', 'stock'] });
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-28 sm:gap-5 lg:pb-0">
      <PageHeader eyebrow={siteName || undefined} title={t('opening.title')} description={t('opening.desc')} />

      {!canWrite && <FieldError>{t('app.docStaffBlocked')}</FieldError>}

      <GlassPanel>
        <FieldLabel htmlFor="opening-date">{t('opening.date')}</FieldLabel>
        <input id="opening-date" type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} className={fieldClass} />
        <p className="mt-1.5 font-sans text-[0.72rem] text-slate-500">{t('opening.dateHint')}</p>
      </GlassPanel>

      <GlassPanel padded={false} title={t('opening.itemsTitle')}>
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <CatalogProductSearch
            placeholder={t('opening.search')}
            disabled={!siteId}
            onPick={(product) =>
              setRows((current) => [
                ...current,
                {
                  key: `${product.id}-${Date.now()}`,
                  product,
                  batchNumber: '',
                  expiryDate: '',
                  qty: '',
                  unitCost: String(product.purchasePrice),
                },
              ])
            }
          />
        </div>
        {checked.length === 0 ? (
          <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('opening.empty')}</p>
        ) : (
          <ul>
            {checked.map(({ row, problem }) => (
              <li key={row.key} className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3.5 last:border-0 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-display text-[0.88rem] font-medium text-ops-ink">{row.product.name}</p>
                    <p className="font-mono text-[0.66rem] text-slate-400">{row.product.code}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-ops-danger"
                    aria-label={t('writeOff.removeItem')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-2.5">
                  {row.product.batchTracking && (
                    <>
                      <div>
                        <FieldLabel htmlFor={`${row.key}-batch`}>{t('writeOff.batch')}</FieldLabel>
                        <input
                          id={`${row.key}-batch`}
                          value={row.batchNumber}
                          onChange={(event) => update(row.key, { batchNumber: event.target.value })}
                          className={cn(fieldClass, 'w-36')}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`${row.key}-expiry`}>{t('stocktake.expiry')}</FieldLabel>
                        <input
                          id={`${row.key}-expiry`}
                          type="date"
                          value={row.expiryDate}
                          onChange={(event) => update(row.key, { expiryDate: event.target.value })}
                          className={fieldClass}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <FieldLabel htmlFor={`${row.key}-qty`}>
                      {t('writeOff.qty')} ({t(`labels.unit.${row.product.unit}`)})
                    </FieldLabel>
                    <input
                      id={`${row.key}-qty`}
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(event) => update(row.key, { qty: event.target.value })}
                      className={cn(fieldClass, 'w-24 text-center')}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${row.key}-cost`}>{t('opening.unitCost')}</FieldLabel>
                    <input
                      id={`${row.key}-cost`}
                      inputMode="decimal"
                      value={row.unitCost}
                      onChange={(event) => update(row.key, { unitCost: event.target.value })}
                      className={cn(fieldClass, 'w-28 text-center')}
                    />
                  </div>
                </div>
                {problem && <p className="font-display text-[0.72rem] font-medium text-ops-danger">{problem}</p>}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      {error && <FieldError>{error}</FieldError>}

      <div className="sticky bottom-24 z-20 lg:bottom-4">
        <div className={cn(glassClass, 'flex items-center justify-between gap-3 px-4 py-3')}>
          <p className="min-w-0 font-display text-[0.84rem] font-medium text-ops-ink">
            {t('writeOff.summary', { count: checked.length })} · {formatEuro(total)}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready || busy}
            className="shrink-0 rounded-xl bg-ops-teal px-4 py-2.5 font-display text-[0.84rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.25)] disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('opening.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
