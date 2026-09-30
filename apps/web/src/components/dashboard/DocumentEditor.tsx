import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PAPER_DOCUMENT_TYPES,
  defaultStockDirection,
  type DocumentType,
} from '@skladnik/shared';
import { ApiError, type DuplicateDocumentRef } from '../../lib/workspace-api';
import { useCreateDocument, usePartnerLookupQuery, useSitesQuery } from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { DateField } from '../ui/DateField';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { useTranslation } from 'react-i18next';
import { useDashboard } from './dashboard-context';
import { GhostButton, GlassPanel, PageHeader } from './dashboard-ui';
import { DateSanityHint, DuplicateNotice } from './document-checks-ui';
import { InlineCreateSupplier } from './InlineCreateSupplier';
import { usePermissions } from '../../lib/permissions';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-[0.65rem] font-sans text-[0.88rem] text-ops-ink outline-none placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30 disabled:opacity-60';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function documentTypeParam(value: string | null): DocumentType | null {
  return PAPER_DOCUMENT_TYPES.find((item) => item === value) ?? null;
}

const CREATE_HEADINGS: Partial<Record<DocumentType, { title: string; desc: string }>> = {
  RECEIPT: { title: 'pages.receiveTitle', desc: 'pages.receiveDesc' },
};

export const DocumentCreatePanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createDocuments, seeFinancials } = usePermissions();
  const canWrite = createDocuments;
  const { siteId: dashboardSiteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const partnersQuery = usePartnerLookupQuery();
  const createDocument = useCreateDocument();
  const sites = (sitesQuery.data?.sites ?? []).filter((site) => site.isActive);
  const partners = partnersQuery.data?.partners ?? [];
  const [searchParams] = useSearchParams();
  const requestedType = documentTypeParam(searchParams.get('type'));
  const heading = requestedType ? CREATE_HEADINGS[requestedType] : undefined;

  const [type, setType] = useState<DocumentType>(requestedType ?? 'INVOICE');
  const [siteId, setSiteId] = useState(dashboardSiteId);
  const [partnerId, setPartnerId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateDocumentRef | null>(null);

  useEffect(() => {
    if (!siteId && dashboardSiteId) setSiteId(dashboardSiteId);
  }, [dashboardSiteId, siteId]);

  useEffect(() => {
    if (requestedType) setType(requestedType);
  }, [requestedType]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDuplicate(null);
    if (!canWrite) {
      setError(t('doc.staffCannotCreate'));
      return;
    }
    try {
      const result = await createDocument.mutateAsync({
        type,
        siteId,
        partnerId: partnerId || undefined,
        documentNumber: documentNumber.trim(),
        issuedOn,
        direction: defaultStockDirection(type),
      });
      toast.success(t('doc.draftCreated'));
      navigate(`/app/invoices/${result.document.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('doc.createFailed'));
      setDuplicate(err instanceof ApiError ? err.existingDocument : null);
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title={t(heading?.title ?? 'pages.newDocTitle')}
        description={t(heading?.desc ?? 'pages.newDocDesc')}
        action={<GhostButton onClick={() => navigate('/app/invoices')}>{t('pages.backToList')}</GhostButton>}
      />

      <GlassPanel title={t('doc.documentHeader')}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <FieldLabel htmlFor="doc-type">{t('doc.type')}</FieldLabel>
            <Select
              id="doc-type"
              value={type}
              onChange={setType}
              options={PAPER_DOCUMENT_TYPES.map((item) => ({ value: item, label: t(`labels.documentType.${item}`) }))}
            />
            <p className="mt-1.5 font-sans text-[0.72rem] text-slate-400">
              {t('doc.stock')} {defaultStockDirection(type) === 'IN' ? t('labels.stockIn') : t('labels.stockOut')}
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="doc-site">{t('doc.site')}</FieldLabel>
            <Select
              id="doc-site"
              value={siteId}
              onChange={setSiteId}
              options={sites.map((site) => ({ value: site.id, label: site.name }))}
              placeholder={t('doc.selectSite')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="doc-partner">{t('doc.partner')}</FieldLabel>
            <Select
              id="doc-partner"
              value={partnerId}
              onChange={setPartnerId}
              options={[
                {
                  value: '',
                  label: type === 'INVOICE' || type === 'CREDIT_NOTE' ? t('doc.partnerRequired') : t('labels.noPartner'),
                },
                ...partners.map((partner) => ({ value: partner.id, label: partner.name })),
              ]}
            />
            {(type === 'INVOICE' || type === 'CREDIT_NOTE') && seeFinancials && (
              <InlineCreateSupplier disabled={createDocument.isPending} onCreated={setPartnerId} />
            )}
          </div>
          <div>
            <FieldLabel htmlFor="doc-number">{t('doc.documentNumber')}</FieldLabel>
            <input
              id="doc-number"
              required
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder={t('doc.printedNumber')}
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="doc-date">{t('doc.issuedOn')}</FieldLabel>
            <DateField id="doc-date" value={issuedOn} onChange={setIssuedOn} className="w-full" />
            <DateSanityHint issuedOn={issuedOn} type={type} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              disabled={createDocument.isPending || !canWrite || !siteId}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ops-teal px-4 py-2.5 font-display text-[0.82rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover disabled:opacity-50"
            >
              {t('doc.createDraft')}
            </button>
          </div>
          {error && (
            <div className="sm:col-span-2">
              {duplicate ? <DuplicateNotice duplicate={duplicate} /> : <FieldError>{error}</FieldError>}
            </div>
          )}
        </form>
      </GlassPanel>
    </div>
  );
};
