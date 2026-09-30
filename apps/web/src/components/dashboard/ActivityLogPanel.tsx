import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ActivityEntry } from '@skladnik/shared';
import { cn } from '../../lib/cn';
import type { ActivityFilters } from '../../lib/workspace-api';
import { useActivityQuery } from '../../lib/workspace-session';
import { DateField } from '../ui/DateField';
import { Select } from '../ui/Select';
import { GhostButton, GlassPanel, PageHeader, tableHeadRowClass } from './dashboard-ui';

const ALL = '__all__';

const filterInputClass =
  'h-11 rounded-xl border border-slate-200 bg-white px-3 font-mono text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50';

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Where the record lives in the app, when it has its own screen. */
function recordLink(entry: ActivityEntry) {
  if (entry.entityType !== 'Document') return null;
  const tillSale = /^S\d{8}-\d+(-V)?$/.test(entry.entityLabel ?? '');
  return tillSale ? `/app/sales/${entry.entityId}` : `/app/invoices/${entry.entityId}`;
}

const ChangeTable: React.FC<{ entry: ActivityEntry }> = ({ entry }) => {
  const { t } = useTranslation();
  const fields = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  const metadata = Object.entries(entry.metadata ?? {});
  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      {fields.length > 0 && (
        <table className="w-full max-w-3xl text-left">
          <thead>
            <tr className="text-[0.66rem] tracking-wider text-slate-400 uppercase">
              <th className="py-1.5 pr-4 font-display font-medium">{t('activity.field')}</th>
              <th className="py-1.5 pr-4 font-display font-medium">{t('activity.before')}</th>
              <th className="py-1.5 font-display font-medium">{t('activity.after')}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-4 font-mono text-[0.76rem] text-slate-500">{field}</td>
                <td className="py-1.5 pr-4 font-mono text-[0.76rem] break-all text-ops-danger/80">{formatValue(entry.before?.[field])}</td>
                <td className="py-1.5 font-mono text-[0.76rem] break-all text-ops-teal">{formatValue(entry.after?.[field])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {metadata.length > 0 && (
        <dl className="grid max-w-3xl grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[0.74rem]">
          {metadata.map(([key, value]) => (
            <React.Fragment key={key}>
              <dt className="text-slate-400">{key}</dt>
              <dd className="break-all text-slate-600">{formatValue(value)}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </div>
  );
};

export const ActivityLogPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<ActivityFilters>({});
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const activityQuery = useActivityQuery(filters);

  const pages = activityQuery.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const facets = pages[0];
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Sofia' }),
    [i18n.language],
  );

  const setFilter = (key: keyof ActivityFilters, value: string | undefined) =>
    setFilters((prev) => ({ ...prev, [key]: value && value !== ALL ? value : undefined }));

  const entityLabel = (type: string) => t(`activity.entity.${type}`, { defaultValue: type });
  const actionLabel = (action: string) => t(`activity.action.${action}`, { defaultValue: action });

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={t('pages.companyEyebrow')} title={t('pages.activityTitle')} description={t('pages.activityDesc')} />

      <GlassPanel>
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter('q', search.trim());
          }}
        >
          <Select
            value={filters.userId ?? ALL}
            onChange={(value) => setFilter('userId', value)}
            options={[{ value: ALL, label: t('activity.anyone') }, ...(facets?.users ?? []).map((user) => ({ value: user.id, label: user.name }))]}
          />
          <Select
            value={filters.entityType ?? ALL}
            onChange={(value) => setFilters((prev) => ({ ...prev, entityType: value === ALL ? undefined : value, action: undefined }))}
            options={[{ value: ALL, label: t('activity.anyRecord') }, ...(facets?.entityTypes ?? []).map((type) => ({ value: type, label: entityLabel(type) }))]}
          />
          <Select
            value={filters.action ?? ALL}
            onChange={(value) => setFilter('action', value)}
            options={[{ value: ALL, label: t('activity.anyAction') }, ...(facets?.actions ?? []).map((action) => ({ value: action, label: actionLabel(action) }))]}
          />
          <DateField
            aria-label={t('activity.from')}
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(value) => setFilter('from', value)}
            className="w-full"
          />
          <DateField
            aria-label={t('activity.to')}
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(value) => setFilter('to', value)}
            className="w-full"
          />
          <label className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (!event.target.value) setFilter('q', undefined);
              }}
              placeholder={t('activity.searchPlaceholder')}
              className={cn(filterInputClass, 'w-full pl-9 font-sans')}
            />
          </label>
        </form>
      </GlassPanel>

      <GlassPanel padded={false}>
        {activityQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('common.loading')}</p>
        ) : activityQuery.isError ? (
          <p className="px-5 py-8 font-sans text-sm text-ops-danger">{activityQuery.error.message}</p>
        ) : entries.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('activity.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="w-8 py-3 pl-4" />
                  <th className="px-3 py-3 font-display font-medium">{t('activity.when')}</th>
                  <th className="px-3 py-3 font-display font-medium">{t('activity.who')}</th>
                  <th className="px-3 py-3 font-display font-medium">{t('activity.record')}</th>
                  <th className="px-3 py-3 font-display font-medium">{t('activity.what')}</th>
                  <th className="px-5 py-3 font-display font-medium">{t('activity.changes')}</th>
                </tr>
              </thead>
              {entries.map((entry) => {
                const expandable = Boolean(entry.before || entry.after || entry.metadata);
                const expanded = open.has(entry.id);
                const changed = Object.keys(entry.after ?? entry.before ?? {});
                const link = recordLink(entry);
                return (
                  <tbody key={entry.id} className="border-b border-slate-100 last:border-0">
                    <tr
                      className={cn('transition-colors hover:bg-ops-canvas/70', expandable && 'cursor-pointer')}
                      onClick={expandable ? () => toggle(entry.id) : undefined}
                    >
                      <td className="py-3 pl-4 text-slate-400">
                        {expandable && (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.76rem] whitespace-nowrap text-slate-500">{dateTime.format(new Date(entry.at))}</td>
                      <td className="px-3 py-3 font-sans text-[0.82rem] text-ops-ink">{entry.user?.name ?? t('activity.system')}</td>
                      <td className="px-3 py-3">
                        <p className="font-sans text-[0.72rem] text-slate-400">{entityLabel(entry.entityType)}</p>
                        {link ? (
                          <Link to={link} onClick={(event) => event.stopPropagation()} className="font-display text-[0.84rem] font-medium text-ops-accent hover:underline">
                            {entry.entityLabel ?? entry.entityId.slice(0, 8)}
                          </Link>
                        ) : (
                          <p className="font-display text-[0.84rem] font-medium text-ops-ink">{entry.entityLabel ?? entry.entityId.slice(0, 8)}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 font-sans text-[0.82rem] text-slate-600">{actionLabel(entry.action)}</td>
                      <td className="px-5 py-3 font-mono text-[0.74rem] text-slate-500">{changed.slice(0, 4).join(', ') || '—'}{changed.length > 4 && ' …'}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6}>
                          <ChangeTable entry={entry} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
        {activityQuery.hasNextPage && (
          <div className="flex justify-center border-t border-slate-100 p-3">
            <GhostButton disabled={activityQuery.isFetchingNextPage} onClick={() => void activityQuery.fetchNextPage()}>
              {activityQuery.isFetchingNextPage ? t('common.loading') : t('activity.more')}
            </GhostButton>
          </div>
        )}
      </GlassPanel>
      <p className="font-sans text-[0.76rem] text-slate-500">{t('activity.appendOnly')}</p>
    </div>
  );
};
