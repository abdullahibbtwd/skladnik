import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../lib/permissions';
import type { StockLine } from '../../lib/dashboard-data';
import { formatDate, formatQty } from '../../lib/format';
import { useDashboard } from './dashboard-context';
import { DaysPill, GhostButton } from './dashboard-ui';
import { RowActionsMenu } from './RowActionsMenu';

/** Batches with stock left, earliest expiry first — what to pull or sell first. */
export const ExpiringBatches: React.FC<{ lines: StockLine[]; empty: string }> = ({ lines, empty }) => {
  const { t, i18n } = useTranslation();
  const { createDocuments } = usePermissions();
  const { writeOff } = useDashboard();

  if (lines.length === 0) {
    return <p className="px-4 py-8 text-center font-sans text-[0.8rem] text-slate-500 sm:px-5">{empty}</p>;
  }

  return (
    <ul>
      {lines.map((line) => {
        const key = `${line.productId}-${line.batch}`;
        return (
          <li key={key} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
            <div className="shrink-0">
              <DaysPill days={line.daysLeft} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-display text-[0.84rem] font-medium text-ops-ink">{line.name}</p>
              <p className="mt-0.5 truncate font-mono text-[0.68rem] text-slate-500">
                {formatQty(line.qty, i18n.language)} {t(`labels.unit.${line.unit}`)} · {line.batch} ·{' '}
                {formatDate(line.expiryDate, i18n.language)}
              </p>
            </div>
            {createDocuments && (
              <>
                <div className="sm:hidden">
                  <RowActionsMenu actions={[{ label: t('expiry.writeOff'), onClick: () => writeOff(line) }]} />
                </div>
                <div className="hidden sm:block">
                  <GhostButton onClick={() => writeOff(line)}>{t('expiry.writeOff')}</GhostButton>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
};
