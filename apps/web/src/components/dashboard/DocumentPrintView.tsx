import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatEuro } from '../../lib/dashboard-data';
import { formatDate, formatQty } from '../../lib/format';
import type { DocumentDetail } from '../../lib/workspace-api';
import { useCompanySettingsQuery } from '../../lib/workspace-session';

/** Signature lines that take the name of whoever entered the document. */
const PREPARED_BY = /^(съставил|prepared by)$/i;

/** The printable document, rendered at the end of <body> and shown only when printing. */
export const DocumentPrintView: React.FC<{ document: DocumentDetail }> = ({ document: doc }) => {
  const { t, i18n } = useTranslation();
  const settings = useCompanySettingsQuery().data;
  if (!settings) return null;
  const { profile, printTemplate: template } = settings;
  const total = doc.lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const typeLabel = t(`labels.documentType.${doc.type}`);
  const companyLine = [profile.eik && `ЕИК ${profile.eik}`, profile.vatNumber && `${t('taxId.vatNumber')} ${profile.vatNumber}`]
    .filter(Boolean)
    .join(' · ');
  const address = [profile.address, profile.city].filter(Boolean).join(', ');

  return createPortal(
    <div className="report-print document-print">
      <header>
        {template.showCompanyDetails && (
          <div className="document-print-company">
            <p className="report-print-company">{profile.name}</p>
            {companyLine && <p className="report-print-meta">{companyLine}</p>}
            {address && <p className="report-print-meta">{address}</p>}
            {profile.mol && <p className="report-print-meta">{t('company.mol')}: {profile.mol}</p>}
          </div>
        )}
        <h1>
          {doc.reversalOf && `${t('reversal.eyebrow')} · `}
          {typeLabel} № {doc.documentNumber}
        </h1>
        <p className="report-print-meta">
          {t('doc.issuedOn')}: {formatDate(doc.issuedOn, i18n.language)}
          {doc.writeOffReason && ` · ${t('writeOff.reasonField')}: ${t(`labels.writeOffReason.${doc.writeOffReason}`)}`}
          {doc.reversalOf &&
            ` · ${t('reversal.printOf', { number: doc.reversalOf.documentNumber, date: formatDate(doc.reversalOf.issuedOn, i18n.language) })}`}
          {doc.reversedBy &&
            ` · ${t('reversal.printReversedBy', { number: doc.reversedBy.documentNumber, date: formatDate(doc.reversedBy.issuedOn, i18n.language) })}`}
        </p>
      </header>

      <div className="document-print-parties">
        <div>
          <p className="document-print-label">{doc.targetSite ? t('transfer.from') : t('doc.site')}</p>
          <p>{doc.site.name}</p>
        </div>
        {doc.targetSite && (
          <div>
            <p className="document-print-label">{t('transfer.to')}</p>
            <p>{doc.targetSite.name}</p>
          </div>
        )}
        {doc.partner && (
          <div>
            <p className="document-print-label">{t('doc.partner')}</p>
            <p>{doc.partner.name}</p>
            <p className="report-print-meta">
              {[doc.partner.eik && `ЕИК ${doc.partner.eik}`, doc.partner.vatNumber && `${t('taxId.vatNumber')} ${doc.partner.vatNumber}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th className="num">№</th>
            <th>{t('print.product')}</th>
            {template.showBatches && <th>{t('print.batch')}</th>}
            <th className="num">{t('print.quantity')}</th>
            {template.showPrices && <th className="num">{t('print.unitPrice')}</th>}
            {template.showPrices && <th className="num">{t('print.amount')}</th>}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, index) => {
            const batch = line.batch?.batchNumber ?? line.batchNumber;
            const expiry = line.batch?.expiryDate ?? line.expiryDate;
            const unit = line.unit ?? line.product?.unit;
            return (
              <tr key={line.id}>
                <td className="num">{index + 1}</td>
                <td>
                  {line.product?.name ?? line.printed.name ?? line.printed.description ?? '—'}
                  {line.product?.code && <span className="report-print-meta"> · {line.product.code}</span>}
                </td>
                {template.showBatches && (
                  <td>{[batch, expiry ? formatDate(expiry, i18n.language) : null].filter(Boolean).join(' · ') || '—'}</td>
                )}
                <td className="num">
                  {formatQty(line.quantity, i18n.language)} {unit ? t(`labels.unit.${unit}`) : ''}
                </td>
                {template.showPrices && <td className="num">{formatEuro(line.finalUnitPrice ?? line.unitPrice ?? 0)}</td>}
                {template.showPrices && <td className="num">{line.lineTotal == null ? '—' : formatEuro(line.lineTotal)}</td>}
              </tr>
            );
          })}
        </tbody>
        {template.showPrices && (
          <tfoot>
            <tr>
              <td colSpan={template.showBatches ? 5 : 4}>{t('print.total')}</td>
              <td className="num">{formatEuro(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      {doc.notes && <p className="report-print-notes">{doc.notes}</p>}

      {template.signatures.length > 0 && (
        <div className="document-print-signatures">
          {template.signatures.map((label, index) => (
            <div key={index}>
              <p>{label}</p>
              <p className="report-print-meta">{PREPARED_BY.test(label.trim()) ? (doc.createdBy?.name ?? '') : ''}</p>
            </div>
          ))}
        </div>
      )}

      {template.footer && <p className="document-print-footer">{template.footer}</p>}
    </div>,
    document.body,
  );
};
