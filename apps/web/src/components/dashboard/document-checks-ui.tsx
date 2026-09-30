import { Link } from 'react-router-dom';
import { CalendarClock, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DOCUMENT_DATE_MAX_AGE_DAYS, PAPER_DOCUMENT_TYPES, documentDateIssue, type DocumentType } from '@skladnik/shared';
import { businessToday } from '../../lib/business-date';
import { cn } from '../../lib/cn';
import { documentPath, type DuplicateDocumentRef } from '../../lib/workspace-api';

/** Shown under a date field: a future date blocks posting, an old one on paperwork needs confirmation. */
export function DateSanityHint({ issuedOn, type }: { issuedOn: string; type: DocumentType }) {
  const { t } = useTranslation();
  if (!issuedOn) return null;
  const issue = documentDateIssue(issuedOn, businessToday());
  if (!issue || (issue === 'OLD' && !(PAPER_DOCUMENT_TYPES as readonly string[]).includes(type))) return null;
  return (
    <p
      className={cn(
        'mt-1.5 flex items-start gap-1.5 font-sans text-[0.72rem]',
        issue === 'FUTURE' ? 'font-medium text-ops-danger' : 'text-amber-700',
      )}
    >
      <CalendarClock size={13} className="mt-px shrink-0" />
      {issue === 'FUTURE' ? t('doc.dateFuture') : t('doc.dateOld', { days: DOCUMENT_DATE_MAX_AGE_DAYS })}
    </p>
  );
}

/** Same partner + type + number already exists; links to it so the user can decide which one is real. */
export function DuplicateNotice({ duplicate, blocking = false }: { duplicate: DuplicateDocumentRef; blocking?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-ops-danger/25 bg-rose-50 px-4 py-3">
      <p className="flex items-center gap-2 font-display text-[0.8rem] font-semibold text-ops-danger">
        <Copy size={14} />
        {t('doc.duplicate.title', {
          type: t(`labels.documentType.${duplicate.type}`),
          number: duplicate.number,
        })}
      </p>
      <p className="mt-1 font-sans text-[0.76rem] text-rose-800">
        {t(duplicate.partnerName ? 'doc.duplicate.bodyPartner' : 'doc.duplicate.body', {
          partner: duplicate.partnerName,
          status: t(`labels.documentStatus.${duplicate.status}`),
          date: duplicate.issuedOn,
        })}{' '}
        {blocking && t('doc.duplicate.blocking')}
      </p>
      <Link
        to={documentPath(duplicate)}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-ops-danger/20 bg-white px-2.5 py-1.5 font-display text-[0.74rem] font-medium text-ops-danger hover:bg-rose-100"
      >
        {t('doc.duplicate.open', { number: duplicate.number })}
      </Link>
    </div>
  );
}
