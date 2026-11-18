import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QUOTE_REQUEST_STATUSES, type QuoteRequestStatus } from '@skladnik/shared';
import { MessageSquareQuote, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '../../components/dashboard/dashboard-ui';
import { listPlatformQuotes } from '../../lib/platform-api';
import {
  formatRelativeTime,
  platformInputClass,
  platformPanelClass,
  platformStatusTone,
} from './platform-ui';

export function PlatformQuotesPage() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<QuoteRequestStatus | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['platform', 'quotes', status, search, page],
    queryFn: () =>
      listPlatformQuotes({
        status: status === 'ALL' ? undefined : status,
        q: search || undefined,
        page,
        pageSize: 20,
      }),
  });

  const filters = useMemo(
    () =>
      (['ALL', ...QUOTE_REQUEST_STATUSES] as const).map((value) => ({
        value,
        label:
          value === 'ALL'
            ? t('platform.quotes.filterAll')
            : t(`platform.quotes.status.${value}`),
      })),
    [t],
  );

  const rows = query.data?.quotes ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.72rem] font-medium tracking-wider text-ops-accent uppercase">
            {t('platform.brand')}
          </p>
          <h1 className="mt-1 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
            {t('platform.quotes.title')}
          </h1>
          <p className="mt-1 max-w-xl font-sans text-[0.8rem] text-slate-500">{t('platform.quotes.subtitle')}</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl border border-ops-accent/15 bg-indigo-50 text-ops-accent">
          <MessageSquareQuote size={20} />
        </div>
      </div>

      <div className={`${platformPanelClass} p-3 sm:p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((filter) => {
              const active = status === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setStatus(filter.value);
                    setPage(1);
                  }}
                  className={
                    active
                      ? 'rounded-full border border-ops-teal/25 bg-ops-teal/10 px-3 py-1.5 font-display text-[0.75rem] font-medium text-ops-teal'
                      : 'rounded-full border border-slate-200 bg-white px-3 py-1.5 font-display text-[0.75rem] font-medium text-slate-500 hover:border-ops-accent/30 hover:text-ops-accent'
                  }
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
          <form
            className="relative w-full sm:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(q.trim());
              setPage(1);
            }}
          >
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t('platform.quotes.searchPlaceholder')}
              className={`${platformInputClass} pl-9`}
            />
          </form>
        </div>
      </div>

      <GlassPanel
        title={t('platform.quotes.inbox')}
        action={
          <span className="rounded-full border border-slate-200 bg-ops-canvas px-2.5 py-0.5 font-display text-[0.7rem] font-medium text-slate-500">
            {t('platform.quotes.count', { count: query.data?.total ?? 0 })}
          </span>
        }
      >
        {query.isLoading && <p className="font-sans text-sm text-slate-400">{t('platform.quotes.loading')}</p>}
        {!query.isLoading && rows.length === 0 && (
          <p className="font-sans text-sm text-slate-500">{t('platform.quotes.empty')}</p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  to={`/platform/quotes/${row.id}`}
                  className="flex items-start justify-between gap-3 py-3.5 transition-colors hover:bg-ops-canvas/60 sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display text-[0.9rem] font-medium text-ops-ink">{row.name}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-display text-[0.68rem] font-medium ${platformStatusTone(row.status)}`}
                      >
                        {t(`platform.quotes.status.${row.status}`)}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-sans text-[0.78rem] text-slate-500">
                      {row.contact} · {row.businessType} · {t('platform.quotes.locations', { count: row.locations })}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-slate-200 bg-ops-canvas px-1.5 py-0.5 font-display text-[0.65rem] uppercase text-slate-500">
                        {row.locale}
                      </span>
                      {row.utmSource && (
                        <span className="rounded-md border border-ops-teal/15 bg-teal-50 px-1.5 py-0.5 font-display text-[0.65rem] text-ops-teal">
                          {row.utmSource}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 pt-0.5 font-sans text-[0.72rem] text-slate-400">
                    {formatRelativeTime(row.createdAt, i18n.language)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {(query.data?.totalPages ?? 1) > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-display text-[0.78rem] font-medium text-ops-ink disabled:opacity-40"
            >
              {t('platform.quotes.prev')}
            </button>
            <p className="font-sans text-[0.72rem] text-slate-400">
              {t('platform.quotes.page', { page, total: query.data?.totalPages ?? 1 })}
            </p>
            <button
              type="button"
              disabled={page >= (query.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-display text-[0.78rem] font-medium text-ops-ink disabled:opacity-40"
            >
              {t('platform.quotes.next')}
            </button>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
