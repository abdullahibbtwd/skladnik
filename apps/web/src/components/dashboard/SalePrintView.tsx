import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatBusinessDateTime } from '../../lib/business-date';
import { formatEuro } from '../../lib/dashboard-data';
import { formatQty } from '../../lib/format';
import type { SaleRecord } from '../../lib/workspace-api';
import { useCompanySettingsQuery } from '../../lib/workspace-session';

/** Printable till receipt — company header from Settings → Company / Document settings. */
export const SalePrintView: React.FC<{ sale: SaleRecord; autoPrint?: boolean }> = ({ sale, autoPrint }) => {
  const { t, i18n } = useTranslation();
  const settings = useCompanySettingsQuery().data;

  useEffect(() => {
    if (!autoPrint || !settings) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint, settings]);

  if (!settings) return null;
  const { profile, printTemplate: template } = settings;
  const isVoid = sale.kind === 'VOID';
  const companyLine = [profile.eik && `ЕИК ${profile.eik}`, profile.vatNumber && `${t('taxId.vatNumber')} ${profile.vatNumber}`]
    .filter(Boolean)
    .join(' · ');
  const address = [profile.address, profile.city].filter(Boolean).join(', ');
  const contact = [profile.phone, profile.email].filter(Boolean).join(' · ');

  return createPortal(
    <div className="report-print receipt-print">
      <header>
        {template.showCompanyDetails && (
          <div className="document-print-company">
            <p className="report-print-company">{profile.name || t('print.companyFallback')}</p>
            {companyLine && <p className="report-print-meta">{companyLine}</p>}
            {address && <p className="report-print-meta">{address}</p>}
            {contact && <p className="report-print-meta">{contact}</p>}
            {profile.mol && <p className="report-print-meta">{t('company.mol')}: {profile.mol}</p>}
          </div>
        )}
        <h1>
          {isVoid ? t('sales.voidTitle', { number: sale.number }) : t('sales.receiptTitle', { number: sale.number })}
        </h1>
        <p className="report-print-meta">
          {[
            sale.site.name,
            sale.postedAt ? formatBusinessDateTime(sale.postedAt, i18n.language) : null,
            sale.cashier?.name,
            sale.paymentMethod ? t(`labels.paymentMethod.${sale.paymentMethod}`) : null,
            sale.paymentReference,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th>{t('print.product')}</th>
            <th className="num">{t('print.quantity')}</th>
            {template.showPrices && <th className="num">{t('print.unitPrice')}</th>}
            {template.showPrices && <th className="num">{t('print.amount')}</th>}
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line) => (
            <tr key={line.id}>
              <td>
                {line.product?.name ?? '—'}
                {line.product?.code && <span className="report-print-meta"> · {line.product.code}</span>}
                {template.showBatches && line.batch?.batchNumber && (
                  <span className="report-print-meta"> · {line.batch.batchNumber}</span>
                )}
              </td>
              <td className="num">
                {formatQty(line.quantity, i18n.language)} {line.product ? t(`labels.unit.${line.product.unit}`) : ''}
              </td>
              {template.showPrices && <td className="num">{formatEuro(line.unitPrice)}</td>}
              {template.showPrices && <td className="num">{formatEuro(line.lineTotal)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {template.showPrices && (
        <table>
          <tbody>
            {sale.vat.map((row) => (
              <tr key={row.rate}>
                <td colSpan={3}>{t('sales.vatRow', { rate: row.rate, net: formatEuro(row.net) })}</td>
                <td className="num">{formatEuro(row.vat)}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>{isVoid ? t('sales.refunded') : t('print.total')}</td>
              <td className="num">{isVoid ? `−${formatEuro(sale.total)}` : formatEuro(sale.total)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {template.footer && <p className="document-print-footer">{template.footer}</p>}
    </div>,
    document.body,
  );
};
