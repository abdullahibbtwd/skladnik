import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  vatIssueMessage,
  type ComplianceIssue,
  type ReportLang,
} from '@skladnik/shared';
import { cn } from '../../lib/cn';
import { documentPath } from '../../lib/workspace-api';
import { GlassPanel } from './dashboard-ui';

type Icon = React.ComponentType<{ size?: number; className?: string }>;

export function ToolbarButton({
  icon: IconComponent,
  label,
  onClick,
  disabled,
  busy,
  primary,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 font-display text-[0.8rem] font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        primary
          ? 'bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover'
          : 'border border-slate-200 bg-white text-ops-ink shadow-sm hover:border-ops-accent/30 hover:bg-indigo-50/60 hover:text-ops-accent',
      )}
    >
      <IconComponent size={15} className={busy ? 'animate-pulse' : undefined} />
      {label}
    </button>
  );
}

const SEVERITY: Record<ComplianceIssue['severity'], { icon: Icon; tone: string }> = {
  error: { icon: AlertCircle, tone: 'text-ops-danger' },
  warning: { icon: AlertTriangle, tone: 'text-ops-warn' },
  info: { icon: Info, tone: 'text-slate-400' },
};

export function IssuesPanel({
  issues,
  lang,
  onOpen,
  message = vatIssueMessage,
  texts,
}: {
  issues: ComplianceIssue[];
  lang: ReportLang;
  onOpen: (issue: ComplianceIssue) => void;
  message?: (issue: ComplianceIssue, lang: ReportLang) => string;
  texts?: { none: string; blocking: string };
}) {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  const shown = issues.filter((issue) => showInfo || issue.severity !== 'info');
  if (shown.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ops-teal/20 bg-teal-50 px-4 py-3 font-sans text-[0.82rem] text-ops-teal" data-testid="vat-issues">
        {texts?.none ?? t('vat.issues.none')}
        {counts.info > 0 && (
          <button type="button" onClick={() => setShowInfo(true)} className="font-display text-[0.76rem] font-medium text-ops-accent hover:underline">
            {t('vat.issues.showNotes', { count: counts.info })}
          </button>
        )}
      </div>
    );
  }
  return (
    <GlassPanel
      padded={false}
      title={t('vat.issues.title')}
      action={
        <span className="font-sans text-[0.74rem] text-slate-500">
          {t('vat.issues.counts', { errors: counts.error, warnings: counts.warning })}
          {counts.info > 0 && (
            <button type="button" onClick={() => setShowInfo((value) => !value)} className="ml-2 text-ops-accent hover:underline">
              {showInfo ? t('vat.issues.hideNotes') : t('vat.issues.showNotes', { count: counts.info })}
            </button>
          )}
        </span>
      }
    >
      <ul className="divide-y divide-slate-100" data-testid="vat-issues">
        {counts.error > 0 && <li className="bg-rose-50/60 px-4 py-2 font-sans text-[0.76rem] font-medium text-ops-danger sm:px-5">{texts?.blocking ?? t('vat.issues.blocking')}</li>}
        {shown.map((issue, index) => {
          const { icon: IconComponent, tone } = SEVERITY[issue.severity];
          const ref = issue.ref;
          return (
            <li key={`${issue.code}-${index}`} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5" data-severity={issue.severity}>
              <IconComponent size={15} className={cn('mt-0.5 shrink-0', tone)} />
              <span className="min-w-0 flex-1 font-sans text-[0.82rem] text-ops-ink">{message(issue, lang)}</span>
              {ref?.kind === 'document' && (
                <Link
                  to={ref.documentType === 'SALE' ? `/app/sales/${ref.id}` : documentPath({ id: ref.id, type: ref.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE' })}
                  className="shrink-0 font-display text-[0.74rem] font-medium text-ops-accent hover:underline"
                >
                  {t('vat.issues.openDocument')}
                </Link>
              )}
              {(ref?.kind === 'settings' || ref?.kind === 'entry' || ref?.kind === 'return' || ref?.kind === 'company' || ref?.kind === 'eshop') && (
                <button type="button" onClick={() => onOpen(issue)} className="shrink-0 font-display text-[0.74rem] font-medium text-ops-accent hover:underline">
                  {t(`vat.issues.fix.${ref.kind}`)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
