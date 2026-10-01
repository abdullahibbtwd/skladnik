import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ClipboardList, FileWarning, Plus } from 'lucide-react';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { formatDate } from '../../lib/format';
import { documentPath } from '../../lib/workspace-api';
import { useDocumentsQuery, useSitesQuery } from '../../lib/workspace-session';
import { Select } from '../ui/Select';
import { useDashboard } from './dashboard-context';
import {
  ActionButton,
  desktopTableWrapClass,
  GlassPanel,
  LiveBadge,
  MetricCard,
  MetricGrid,
  mobileCardClass,
  mobileCardListClass,
  PageHeader,
  StatusPill,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';

export const InvoicesPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'SITE_MANAGER';
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const [statusFilter, setStatusFilter] = useState<'ALL' | DocumentStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | DocumentType>('ALL');
  const [siteFilter, setSiteFilter] = useState<'ALL' | 'CURRENT'>('CURRENT');

  const queryFilters = useMemo(
    () => ({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      type: typeFilter === 'ALL' ? undefined : typeFilter,
      siteId: siteFilter === 'CURRENT' && siteId ? siteId : undefined,
    }),
    [siteFilter, siteId, statusFilter, typeFilter],
  );
  const documentsQuery = useDocumentsQuery(queryFilters);
  const documents = documentsQuery.data?.documents ?? [];
  const sites = (sitesQuery.data?.sites ?? []).filter((site) => site.isActive);
  const currentSite = sites.find((site) => site.id === siteId);
  // SKL-18: same rule as dashboard/bell — only SUBMITTED (REVIEW), never drafts.
  const reviewCount = documents.filter((doc) => doc.status === 'REVIEW').length;
  const postedCount = documents.filter((doc) => doc.status === 'POSTED').length;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title={t('pages.documentsTitle')}
        description={t('pages.documentsDesc')}
        action={
          canWrite ? (
            <ActionButton icon={Plus} label={t('pages.newDocument')} onClick={() => navigate('/app/invoices/new')} primary />
          ) : undefined
        }
      />

      {canWrite && (
        <div className="md:hidden">
          <ActionButton icon={Plus} label={t('pages.newDocument')} onClick={() => navigate('/app/invoices/new')} primary />
        </div>
      )}

      <MetricGrid columns={3}>
        <MetricCard
          label={t('invoices.open')}
          value={String(reviewCount)}
          hint={reviewCount === 1 ? t('doc.draftOrReviewOne') : t('doc.draftOrReviewMany', { count: reviewCount })}
          icon={FileWarning}
          iconColor="text-ops-warn"
        />
        <MetricCard
          label={t('invoices.posted')}
          value={String(postedCount)}
          hint={t('invoices.postedHint')}
          icon={ClipboardList}
          iconColor="text-ops-accent"
        />
        <MetricCard
          label={t('invoices.thisList')}
          value={String(documents.length)}
          hint={siteFilter === 'CURRENT' ? currentSite?.name ?? t('invoices.currentSite') : t('invoices.allLocations')}
          icon={CheckCircle2}
          iconColor="text-ops-teal"
        />
      </MetricGrid>

      <GlassPanel
        title={t('invoices.intake')}
        action={<LiveBadge>{t('invoices.shown', { count: documents.length })}</LiveBadge>}
      >
        <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: t('invoices.allStatuses') },
              ...DOCUMENT_STATUSES.map((status) => ({ value: status, label: t(`labels.documentStatus.${status}`) })),
            ]}
          />
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'ALL', label: t('invoices.allTypes') },
              ...DOCUMENT_TYPES.map((type) => ({ value: type, label: t(`labels.documentType.${type}`) })),
            ]}
          />
          <Select
            value={siteFilter}
            onChange={setSiteFilter}
            options={[
              { value: 'CURRENT', label: currentSite ? t('invoices.siteNamed', { name: currentSite.name }) : t('invoices.currentSite') },
              { value: 'ALL', label: t('invoices.allLocations') },
            ]}
          />
        </div>

        {documentsQuery.isPending ? (
          <p className="py-8 text-center font-sans text-[0.8rem] text-slate-400">{t('invoices.loading')}</p>
        ) : documentsQuery.isError ? (
          <p className="py-8 text-center font-sans text-[0.8rem] text-ops-danger">{t('invoices.loadFailed')}</p>
        ) : documents.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 size={22} className="mx-auto mb-2 text-ops-teal" />
            <p className="font-display text-[0.88rem] font-medium text-ops-ink">{t('invoices.empty')}</p>
            <p className="mt-1 font-sans text-[0.76rem] text-slate-400">{t('invoices.emptyHint')}</p>
          </div>
        ) : (
          <>
            <ul className={`${mobileCardListClass()} -mx-4 sm:-mx-5`}>
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => navigate(documentPath(doc))}
                    className={`${mobileCardClass()} w-full cursor-pointer text-left transition-colors hover:bg-ops-canvas/70`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-[0.86rem] font-medium text-ops-ink">
                          {doc.reversalOf && `${t('reversal.eyebrow')} · `}
                          {t(`labels.documentType.${doc.type}`)}
                          {doc.writeOffReason && ` · ${t(`labels.writeOffReason.${doc.writeOffReason}`)}`}
                        </p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {doc.documentNumber} ·{' '}
                          {doc.type === 'STOCKTAKE'
                            ? t('stocktake.adjustment')
                            : doc.direction === 'IN'
                              ? t('labels.stockIn')
                              : t('labels.stockOut')}{' '}
                          · {t('invoices.lines', { count: doc.lineCount })}
                        </p>
                        <p className="mt-1 font-sans text-[0.74rem] text-slate-500">
                          {doc.partner?.name ?? '—'} · {doc.targetSite ? `${doc.site.name} → ${doc.targetSite.name}` : doc.site.name} · {formatDate(doc.issuedOn, i18n.language)}
                          {doc.createdBy?.name ? ` · ${t('invoices.createdBy', { name: doc.createdBy.name })}` : ''}
                        </p>
                      </div>
                      <StatusPill status={doc.reversedBy ? 'REVERSED' : doc.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className={`${desktopTableWrapClass()} -mx-4 sm:-mx-5`}>
              <table className="w-full min-w-[36rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-4 py-2.5 font-display font-medium sm:px-5">{t('invoices.document')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('invoices.partner')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('invoices.site')}</th>
                    <th className="px-3 py-2.5 font-display font-medium">{t('invoices.date')}</th>
                    <th className="px-4 py-2.5 text-right font-display font-medium sm:px-5">{t('invoices.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className={`${tableRowClass()} cursor-pointer`}
                      onClick={() => navigate(documentPath(doc))}
                    >
                      <td className="px-4 py-3 sm:px-5">
                        <p className="font-display text-[0.82rem] font-medium text-ops-ink">
                          {doc.reversalOf && `${t('reversal.eyebrow')} · `}
                          {t(`labels.documentType.${doc.type}`)}
                          {doc.writeOffReason && ` · ${t(`labels.writeOffReason.${doc.writeOffReason}`)}`}
                        </p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {doc.documentNumber} ·{' '}
                          {doc.type === 'STOCKTAKE'
                            ? t('stocktake.adjustment')
                            : doc.direction === 'IN'
                              ? t('labels.stockIn')
                              : t('labels.stockOut')}{' '}
                          · {t('invoices.lines', { count: doc.lineCount })}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-sans text-[0.8rem] text-slate-600">{doc.partner?.name ?? '—'}</td>
                      <td className="px-3 py-3 font-sans text-[0.8rem] text-slate-600">
                        {doc.targetSite ? `${doc.site.name} → ${doc.targetSite.name}` : doc.site.name}
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.74rem] text-slate-500">{formatDate(doc.issuedOn, i18n.language)}</td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <StatusPill status={doc.reversedBy ? 'REVERSED' : doc.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassPanel>
    </div>
  );
};
