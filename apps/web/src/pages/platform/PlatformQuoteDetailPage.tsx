import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  QUOTE_REQUEST_STATUS_TRANSITIONS,
  type QuoteRequestStatus,
} from '@skladnik/shared';
import { ArrowLeft, Building2, MapPin, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '../../components/dashboard/dashboard-ui';
import { Select } from '../../components/ui/Select';
import { getPlatformQuote, updatePlatformQuoteStatus } from '../../lib/platform-api';
import {
  formatRelativeTime,
  platformErrorClass,
  platformPanelClass,
  platformPrimaryBtnClass,
  platformSecondaryBtnClass,
  platformStatusTone,
} from './platform-ui';

export function PlatformQuoteDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState<QuoteRequestStatus | ''>('');

  const quoteQuery = useQuery({
    queryKey: ['platform', 'quotes', id],
    queryFn: () => getPlatformQuote(id),
    enabled: Boolean(id),
  });

  const quote = quoteQuery.data?.quote;
  const targets = useMemo(
    () => (quote ? [...QUOTE_REQUEST_STATUS_TRANSITIONS[quote.status]] : []),
    [quote],
  );

  const mutation = useMutation({
    mutationFn: (status: QuoteRequestStatus) => updatePlatformQuoteStatus(id, status),
    onSuccess: async () => {
      setNextStatus('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform', 'quotes'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'stats'] }),
      ]);
    },
  });

  if (quoteQuery.isLoading) {
    return <p className="font-sans text-sm text-slate-400">{t('platform.quotes.loading')}</p>;
  }

  if (!quote) {
    return (
      <div className="flex flex-col gap-3">
        <p className={platformErrorClass}>{t('platform.quotes.notFound')}</p>
        <Link to="/platform/quotes" className={platformSecondaryBtnClass}>
          <ArrowLeft size={14} />
          {t('platform.quotes.back')}
        </Link>
      </div>
    );
  }

  const selected = nextStatus || targets[0] || quote.status;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/platform/quotes"
            className="inline-flex items-center gap-1.5 font-display text-[0.78rem] font-medium text-slate-500 transition hover:text-ops-teal"
          >
            <ArrowLeft size={14} />
            {t('platform.quotes.back')}
          </Link>
          <h1 className="mt-2 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">{quote.name}</h1>
          <p className="mt-1 font-sans text-[0.8rem] text-slate-500">
            {formatRelativeTime(quote.createdAt, i18n.language)} · {quote.contact}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-display text-[0.75rem] font-medium ${platformStatusTone(quote.status)}`}
        >
          {t(`platform.quotes.status.${quote.status}`)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <GlassPanel title={t('platform.quotes.detail')}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailItem icon={Building2} label={t('platform.quotes.businessType')} value={quote.businessType} />
            <DetailItem
              icon={MapPin}
              label={t('platform.quotes.locationsLabel')}
              value={t('platform.quotes.locations', { count: quote.locations })}
            />
            <DetailItem label={t('platform.quotes.contact')} value={quote.contact} />
            <DetailItem label={t('platform.quotes.locale')} value={quote.locale.toUpperCase()} />
          </dl>
          <div className="mt-4 rounded-xl border border-slate-100 bg-ops-canvas/70 px-3.5 py-3">
            <p className="font-display text-[0.72rem] font-medium tracking-wider text-slate-500 uppercase">
              {t('platform.quotes.message')}
            </p>
            <p className="mt-2 whitespace-pre-wrap font-sans text-[0.88rem] leading-relaxed text-ops-ink">
              {quote.message?.trim() || t('platform.quotes.noMessage')}
            </p>
          </div>
        </GlassPanel>

        <div className="flex flex-col gap-4">
          <div className={`${platformPanelClass} p-4 sm:p-5`}>
            <p className="font-display text-[0.85rem] font-semibold text-ops-ink">{t('platform.quotes.updateStatus')}</p>
            <p className="mt-1 font-sans text-[0.75rem] text-slate-500">{t('platform.quotes.updateStatusHint')}</p>
            {targets.length === 0 ? (
              <p className="mt-4 font-sans text-sm text-slate-400">{t('platform.quotes.noTransitions')}</p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <Select
                  value={selected}
                  onChange={(value) => setNextStatus(value as QuoteRequestStatus)}
                  options={targets.map((value) => ({
                    value,
                    label: t(`platform.quotes.status.${value}`),
                  }))}
                />
                <button
                  type="button"
                  disabled={mutation.isPending || selected === quote.status}
                  onClick={() => mutation.mutate(selected as QuoteRequestStatus)}
                  className={platformPrimaryBtnClass}
                >
                  {mutation.isPending ? t('platform.quotes.saving') : t('platform.quotes.saveStatus')}
                </button>
                {mutation.isError && (
                  <p className={platformErrorClass}>
                    {mutation.error instanceof Error ? mutation.error.message : t('platform.quotes.saveFailed')}
                  </p>
                )}
              </div>
            )}
          </div>

          <GlassPanel title={t('platform.quotes.attribution')}>
            <div className="flex flex-col gap-2.5">
              <AttrRow icon={Megaphone} label="utm_source" value={quote.utmSource} />
              <AttrRow label="utm_medium" value={quote.utmMedium} />
              <AttrRow label="utm_campaign" value={quote.utmCampaign} />
              <AttrRow label={t('platform.quotes.referrer')} value={quote.referrer} />
              {quote.statusUpdatedAt && (
                <AttrRow
                  label={t('platform.quotes.statusUpdated')}
                  value={formatRelativeTime(quote.statusUpdatedAt, i18n.language)}
                />
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-ops-canvas/70 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 font-display text-[0.72rem] text-slate-500">
        {Icon ? <Icon size={13} /> : null}
        {label}
      </dt>
      <dd className="mt-1 font-display text-[0.92rem] font-medium text-ops-ink">{value}</dd>
    </div>
  );
}

function AttrRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Megaphone;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-ops-canvas/70 px-3 py-2.5">
      <span className="flex items-center gap-1.5 font-display text-[0.75rem] text-slate-500">
        {Icon ? <Icon size={13} /> : null}
        {label}
      </span>
      <span className="truncate font-sans text-[0.78rem] font-medium text-ops-ink">{value || '—'}</span>
    </div>
  );
}
