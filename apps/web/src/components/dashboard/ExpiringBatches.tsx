import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthRole } from '../../lib/auth-store';
import type { StockLine } from '../../lib/dashboard-data';
import { useDashboard } from './dashboard-context';
import { DaysPill, GhostButton } from './dashboard-ui';

/** Batches with stock left, earliest expiry first — what to pull or sell first. */
export const ExpiringBatches: React.FC<{ lines: StockLine[]; empty: string }> = ({ lines, empty }) => {
  const { t, i18n } = useTranslation();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT' || role === 'SITE_MANAGER';
  const { writeOff } = useDashboard();

  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    [i18n.language],
  );

  if (lines.length === 0) {
    return <p className="px-4 py-8 text-center font-sans text-[0.8rem] text-slate-500 sm:px-5">{empty}</p>;
  }

  return (
    <ul>
      {lines.map((line) => {
        const key = `${line.productId}-${line.batch}`;
        return (
          <li key={key} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
            <div className="w-[4.5rem] shrink-0">
              <DaysPill days={line.daysLeft} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-display text-[0.84rem] font-medium text-ops-ink">{line.name}</p>
              <p className="mt-0.5 truncate font-mono text-[0.68rem] text-slate-500">
                {qtyFormat.format(line.qty)} {t(`labels.unit.${line.unit}`)} · {line.batch} ·{' '}
                {dateFormat.format(new Date(`${line.expiryDate}T00:00:00Z`))}
              </p>
            </div>
            {canWrite && <GhostButton onClick={() => writeOff(line)}>{t('expiry.writeOff')}</GhostButton>}
          </li>
        );
      })}
    </ul>
  );
};
