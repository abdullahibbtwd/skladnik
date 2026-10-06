import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Copy, Download, Eye, Plus, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@skladnik/shared';
import { useTranslation } from 'react-i18next';
import {
  PlatformApiError,
  createPlatformSubscription,
  downloadPlatformInvoicePdf,
  listPlatformSubscriptions,
  revealPlatformActivationCode,
  transitionPlatformSubscription,
  type CreateSubscriptionInput,
  type PlatformSubscriptionListItem,
} from '../../lib/platform-api';
import { GlassPanel, LiveBadge, tableHeadRowClass, tableRowClass } from '../../components/dashboard/dashboard-ui';
import { FieldLabel } from '../../components/PasswordField';
import { Select } from '../../components/ui/Select';
import { StatusTransitionControl } from './StatusTransitionControl';
import {
  PLATFORM_PLAN_PRESETS,
  platformErrorClass,
  platformInputClass,
  platformPanelClass,
  platformPlanSelectOptions,
  platformPrimaryBtnClass,
  platformSecondaryBtnClass,
  platformStatusTone,
  platformWarnClass,
} from './platform-ui';

const listKey = ['platform', 'subscriptions'] as const;
const PAGE_SIZE = 20;

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function PlatformSubscriptionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ subscriptionId: string; invoiceId: string; number: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [revealForId, setRevealForId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [status, plan, q]);

  const listQuery = useQuery({
    queryKey: [...listKey, status, plan, q, page, PAGE_SIZE],
    queryFn: () =>
      listPlatformSubscriptions({
        status: status || undefined,
        plan: plan || undefined,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const createMutation = useMutation({
    mutationFn: ({ input, key }: { input: CreateSubscriptionInput; key: string }) =>
      createPlatformSubscription(input, key),
    onSuccess: async (result) => {
      setRevealedCode(result.activationCode);
      setCreatedInvoice({
        subscriptionId: result.subscription.id,
        invoiceId: result.invoiceId,
        number: result.subscription.latestInvoice?.number ?? 'invoice',
      });
      setCreateOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'stats'] }),
      ]);
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (args: {
      id: string;
      toStatus: SubscriptionStatus;
      reason?: string;
      version: number;
    }) => transitionPlatformSubscription(args.id, args),
    onSuccess: async (_result, vars) => {
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (err, vars) => {
      const message =
        err instanceof PlatformApiError && err.code === 'VERSION_CONFLICT'
          ? t('platform.status.versionConflict')
          : err instanceof Error
            ? err.message
            : t('platform.detail.actionFailed');
      setRowErrors((prev) => ({ ...prev, [vars.id]: message }));
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const rows = listQuery.data?.subscriptions ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const currentPage = listQuery.data?.page ?? page;

  const statusOptions = useMemo(
    () => [
      { value: '' as const, label: t('platform.subscriptions.anyStatus') },
      ...SUBSCRIPTION_STATUSES.map((value) => ({ value, label: value })),
    ],
    [t],
  );

  const planOptions = useMemo(
    () => [
      { value: '' as const, label: t('platform.subscriptions.anyPlan') },
      ...platformPlanSelectOptions(t),
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.72rem] font-medium tracking-wider text-ops-accent uppercase">
            {t('platform.brand')}
          </p>
          <h1 className="mt-1 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
            {t('platform.subscriptions.title')}
          </h1>
          <p className="mt-1 max-w-xl font-sans text-[0.8rem] text-slate-500">
            {t('platform.subscriptions.subtitle')}
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={platformPrimaryBtnClass}>
          <Plus size={16} />
          {t('platform.subscriptions.create')}
        </button>
      </div>

      <GlassPanel
        title={t('platform.subscriptions.filters')}
        action={<LiveBadge>{t('platform.subscriptions.shown', { count: total })}</LiveBadge>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)]">
          <div className="relative min-w-0">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('platform.subscriptions.search')}
              className={`${platformInputClass} pl-10`}
              aria-label={t('platform.subscriptions.search')}
            />
          </div>
          <Select
            value={status}
            onChange={setStatus}
            options={statusOptions}
            placeholder={t('platform.subscriptions.anyStatus')}
          />
          <Select
            value={plan}
            onChange={setPlan}
            options={planOptions}
            placeholder={t('platform.subscriptions.anyPlan')}
          />
        </div>
      </GlassPanel>

      <GlassPanel padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-left text-sm">
            <thead className={tableHeadRowClass()}>
              <tr>
                <th className="w-[22%] px-4 py-2.5 font-display font-medium sm:px-5">{t('platform.subscriptions.colCompany')}</th>
                <th className="w-[12%] px-3 py-2.5 font-display font-medium">{t('platform.subscriptions.colPlan')}</th>
                <th className="w-[11%] px-3 py-2.5 font-display font-medium">{t('platform.subscriptions.colStatus')}</th>
                <th className="w-[20%] px-3 py-2.5 font-display font-medium">{t('platform.subscriptions.colInvoice')}</th>
                <th className="w-[14%] px-3 py-2.5 font-display font-medium">{t('platform.subscriptions.colCode')}</th>
                <th className="w-[10%] px-3 py-2.5 font-display font-medium">{t('platform.subscriptions.colCreated')}</th>
                <th className="w-[11%] px-3 py-2.5 pr-4 text-right font-display font-medium sm:pr-5">
                  {t('platform.subscriptions.colActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 sm:px-5">
                    {t('platform.subscriptions.loading')}
                  </td>
                </tr>
              )}
              {!listQuery.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center sm:px-5">
                    <p className="font-display text-[0.88rem] font-medium text-ops-ink">{t('platform.subscriptions.empty')}</p>
                    <p className="mt-1 font-sans text-[0.76rem] text-slate-400">{t('platform.subscriptions.emptyHint')}</p>
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <SubscriptionRow
                  key={row.id}
                  row={row}
                  busy={transitionMutation.isPending && transitionMutation.variables?.id === row.id}
                  error={rowErrors[row.id] ?? null}
                  onTransition={(input) =>
                    transitionMutation.mutate({
                      id: row.id,
                      toStatus: input.toStatus,
                      reason: input.reason,
                      version: input.version,
                    })
                  }
                  onReveal={() => setRevealForId(row.id)}
                  onDownloadInvoice={
                    row.latestInvoice
                      ? () =>
                          void downloadPlatformInvoicePdf(
                            row.id,
                            row.latestInvoice!.id,
                            `${row.latestInvoice!.number}.pdf`,
                          )
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
        {!listQuery.isLoading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="font-sans text-[0.78rem] text-slate-500">
              {t('platform.subscriptions.pagination.summary', {
                page: currentPage,
                totalPages,
                total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1 || listQuery.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={platformSecondaryBtnClass}
              >
                <ChevronLeft size={14} />
                {t('platform.subscriptions.pagination.prev')}
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages || listQuery.isFetching}
                onClick={() => setPage((p) => p + 1)}
                className={platformSecondaryBtnClass}
              >
                {t('platform.subscriptions.pagination.next')}
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </GlassPanel>

      {createOpen && (
        <CreateSubscriptionModal
          busy={createMutation.isPending}
          error={createMutation.error instanceof Error ? createMutation.error.message : null}
          onClose={() => {
            if (!createMutation.isPending) setCreateOpen(false);
          }}
          onSubmit={(input, key) => createMutation.mutate({ input, key })}
        />
      )}

      {revealForId && (
        <RevealCodeModal
          subscriptionId={revealForId}
          onClose={() => setRevealForId(null)}
          onRevealed={(code) => {
            setRevealForId(null);
            setRevealedCode(code);
            setCreatedInvoice(null);
            setCopied(false);
          }}
        />
      )}

      {revealedCode && (
        <ActivationCodeModal
          code={revealedCode}
          invoice={createdInvoice}
          copied={copied}
          onCopy={async () => {
            await navigator.clipboard.writeText(revealedCode);
            setCopied(true);
          }}
          onDownloadInvoice={
            createdInvoice
              ? () =>
                  void downloadPlatformInvoicePdf(
                    createdInvoice.subscriptionId,
                    createdInvoice.invoiceId,
                    `${createdInvoice.number}.pdf`,
                  )
              : undefined
          }
          onClose={() => {
            setRevealedCode(null);
            setCreatedInvoice(null);
            setCopied(false);
          }}
        />
      )}
    </div>
  );
}

function SubscriptionRow({
  row,
  busy,
  error,
  onTransition,
  onReveal,
  onDownloadInvoice,
}: {
  row: PlatformSubscriptionListItem;
  busy: boolean;
  error: string | null;
  onTransition: (input: { toStatus: SubscriptionStatus; reason?: string; version: number }) => void;
  onReveal: () => void;
  onDownloadInvoice?: () => void;
}) {
  const { t } = useTranslation();
  const iconBtn =
    'inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent disabled:opacity-60';

  return (
    <tr className={tableRowClass()}>
      <td className="px-4 py-3 align-middle sm:px-5">
        <Link
          to={`/platform/subscriptions/${row.id}`}
          className="block truncate font-display text-[0.88rem] font-medium text-ops-teal hover:underline"
          title={row.company?.name || row.companyNameHint || t('platform.subscriptions.unbound')}
        >
          {row.company?.name || row.companyNameHint || t('platform.subscriptions.unbound')}
        </Link>
        {row.contactEmail && (
          <div className="mt-0.5 truncate text-[0.72rem] text-slate-500" title={row.contactEmail}>
            {row.contactEmail}
          </div>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="font-display text-[0.82rem] font-medium text-ops-ink">{row.plan}</div>
        <div className="mt-0.5 whitespace-nowrap text-[0.72rem] text-slate-500">
          {row.maxUsers} {t('platform.subscriptions.usersShort')} · {row.termMonths}m
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <StatusPill status={row.status} />
      </td>
      <td className="px-3 py-3 align-middle">
        {row.latestInvoice ? (
          <div className="min-w-0">
            <div className="truncate font-mono text-[0.78rem] text-ops-ink" title={row.latestInvoice.number}>
              {row.latestInvoice.number}
            </div>
            <div className="mt-0.5 whitespace-nowrap text-[0.72rem] text-slate-500">
              {row.latestInvoice.status} · {formatMoney(row.latestInvoice.totalMinor, row.latestInvoice.currency)}
            </div>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <span className="font-mono text-[0.78rem] tracking-wide text-slate-600">{row.openCodePrefix ?? '—'}</span>
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap text-[0.78rem] text-slate-500">
        {new Date(row.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-3 pr-4 align-middle sm:pr-5">
        <div className="flex items-center justify-end gap-1.5">
          {onDownloadInvoice && (
            <button
              type="button"
              onClick={onDownloadInvoice}
              className={iconBtn}
              title={t('platform.detail.pdf')}
              aria-label={t('platform.detail.pdf')}
            >
              <Download size={14} />
            </button>
          )}
          {row.codeRevealable && (
            <button
              type="button"
              onClick={onReveal}
              className={iconBtn}
              title={t('platform.detail.reveal')}
              aria-label={t('platform.detail.reveal')}
            >
              <Eye size={14} />
            </button>
          )}
          <StatusTransitionControl
            iconOnly
            status={row.status}
            version={row.version}
            invoicePaid={row.latestInvoice?.status === 'PAID'}
            busy={busy}
            error={error}
            onTransition={onTransition}
          />
        </div>
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={`inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[0.68rem] font-medium tracking-wide ${platformStatusTone(status)}`}
    >
      {status}
    </span>
  );
}

function CreateSubscriptionModal({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: CreateSubscriptionInput, idempotencyKey: string) => void;
}) {
  const { t } = useTranslation();
  const starter = PLATFORM_PLAN_PRESETS.STARTER;
  const [plan, setPlan] = useState<SubscriptionPlan>('STARTER');
  const [maxUsers, setMaxUsers] = useState(starter.maxUsers);
  const [termMonths, setTermMonths] = useState(starter.termMonths);
  const [priceMajor, setPriceMajor] = useState(starter.priceMajor);
  const [currency, setCurrency] = useState(starter.currency);
  const [vatRate, setVatRate] = useState('20');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEik, setBuyerEik] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [invoiceTitle, setInvoiceTitle] = useState('Proforma invoice');
  const [companyNameHint, setCompanyNameHint] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [externalInvoiceRef, setExternalInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const planOptions = useMemo(() => platformPlanSelectOptions(t), [t]);

  const applyPlan = (next: SubscriptionPlan) => {
    const preset = PLATFORM_PLAN_PRESETS[next];
    setPlan(next);
    setMaxUsers(preset.maxUsers);
    setTermMonths(preset.termMonths);
    setPriceMajor(preset.priceMajor);
    setCurrency(preset.currency);
  };

  const onForm = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const major = Number(priceMajor.replace(',', '.'));
    if (!Number.isFinite(major) || major < 0) {
      setLocalError(t('platform.subscriptions.invalidPrice'));
      return;
    }
    const rate = Number(vatRate.replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setLocalError(t('platform.subscriptions.invalidVat'));
      return;
    }
    setLocalError(null);
    onSubmit(
      {
        plan,
        maxUsers,
        termMonths,
        priceMinor: Math.round(major * 100),
        currency: currency.trim().toUpperCase(),
        vatRate: rate,
        buyerName: buyerName.trim(),
        buyerEik: buyerEik.trim(),
        buyerAddress: buyerAddress.trim(),
        buyerEmail: buyerEmail.trim(),
        invoiceTitle: invoiceTitle.trim() || undefined,
        companyNameHint: companyNameHint.trim() || buyerName.trim() || undefined,
        contactEmail: contactEmail.trim() || buyerEmail.trim() || undefined,
        externalInvoiceRef: externalInvoiceRef.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      crypto.randomUUID(),
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`${platformPanelClass} max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.subscriptions.createTitle')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('platform.subscriptions.createSub')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-ops-canvas hover:text-ops-ink disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <form className="grid gap-4" onSubmit={onForm}>
          <div>
            <FieldLabel htmlFor="create-plan">{t('platform.subscriptions.plan')}</FieldLabel>
            <Select id="create-plan" value={plan} onChange={applyPlan} options={planOptions} disabled={busy} />
            <p className="mt-1.5 font-sans text-[0.72rem] text-slate-400">{t('platform.subscriptions.planHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="create-max-users">{t('platform.subscriptions.maxUsers')}</FieldLabel>
              <input
                id="create-max-users"
                type="number"
                min={1}
                max={10000}
                required
                disabled={busy}
                value={maxUsers}
                onChange={(e) => setMaxUsers(Number(e.target.value))}
                className={platformInputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="create-term">{t('platform.subscriptions.termMonths')}</FieldLabel>
              <input
                id="create-term"
                type="number"
                min={1}
                max={120}
                required
                disabled={busy}
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value))}
                className={platformInputClass}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-ops-canvas/60 p-3">
            <p className="mb-3 font-display text-[0.78rem] font-medium tracking-wide text-slate-500 uppercase">
              {t('platform.subscriptions.invoiceSection')}
            </p>
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <FieldLabel htmlFor="create-price">{t('platform.subscriptions.price')}</FieldLabel>
                  <input
                    id="create-price"
                    inputMode="decimal"
                    required
                    disabled={busy}
                    value={priceMajor}
                    onChange={(e) => setPriceMajor(e.target.value)}
                    className={platformInputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="create-currency">{t('platform.subscriptions.currency')}</FieldLabel>
                  <input
                    id="create-currency"
                    required
                    disabled={busy}
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className={platformInputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="create-vat">{t('platform.subscriptions.vatRate')}</FieldLabel>
                  <input
                    id="create-vat"
                    inputMode="decimal"
                    required
                    disabled={busy}
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className={platformInputClass}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="create-invoice-title">{t('platform.subscriptions.invoiceTitle')}</FieldLabel>
                <input
                  id="create-invoice-title"
                  disabled={busy}
                  value={invoiceTitle}
                  onChange={(e) => setInvoiceTitle(e.target.value)}
                  className={platformInputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="create-buyer-name">{t('platform.subscriptions.buyerName')}</FieldLabel>
                <input
                  id="create-buyer-name"
                  required
                  disabled={busy}
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className={platformInputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="create-buyer-eik">{t('platform.subscriptions.buyerEik')}</FieldLabel>
                <input
                  id="create-buyer-eik"
                  required
                  disabled={busy}
                  value={buyerEik}
                  onChange={(e) => setBuyerEik(e.target.value)}
                  className={platformInputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="create-buyer-address">{t('platform.subscriptions.buyerAddress')}</FieldLabel>
                <input
                  id="create-buyer-address"
                  required
                  disabled={busy}
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  className={platformInputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="create-buyer-email">{t('platform.subscriptions.buyerEmail')}</FieldLabel>
                <input
                  id="create-buyer-email"
                  type="email"
                  required
                  disabled={busy}
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className={platformInputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="create-company">{t('platform.subscriptions.companyHint')}</FieldLabel>
            <input
              id="create-company"
              disabled={busy}
              value={companyNameHint}
              onChange={(e) => setCompanyNameHint(e.target.value)}
              className={platformInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="create-email">{t('platform.subscriptions.contactEmail')}</FieldLabel>
            <input
              id="create-email"
              type="email"
              disabled={busy}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={platformInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="create-invoice">{t('platform.subscriptions.invoiceRef')}</FieldLabel>
            <input
              id="create-invoice"
              disabled={busy}
              value={externalInvoiceRef}
              onChange={(e) => setExternalInvoiceRef(e.target.value)}
              className={platformInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="create-notes">{t('platform.subscriptions.notes')}</FieldLabel>
            <textarea
              id="create-notes"
              disabled={busy}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={platformInputClass}
            />
          </div>
          {(localError || error) && <p className={platformErrorClass}>{localError || error}</p>}
          <button type="submit" disabled={busy} className={`${platformPrimaryBtnClass} mt-1 w-full`}>
            {busy ? t('platform.subscriptions.creating') : t('platform.subscriptions.createSubmit')}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function ActivationCodeModal({
  code,
  invoice,
  copied,
  onCopy,
  onDownloadInvoice,
  onClose,
}: {
  code: string;
  invoice?: { subscriptionId: string; invoiceId: string; number: string } | null;
  copied: boolean;
  onCopy: () => void;
  onDownloadInvoice?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const warning = useMemo(() => t('platform.subscriptions.codeWarning'), [t]);

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`${platformPanelClass} w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.subscriptions.codeTitle')}</h2>
        <p className={`mt-2 ${platformWarnClass}`}>{warning}</p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-ops-canvas px-3 py-3 font-mono text-sm tracking-wide break-all text-ops-ink">
          {code}
        </div>
        {invoice && (
          <p className="mt-3 text-sm text-slate-500">
            {t('platform.subscriptions.invoiceReady', { number: invoice.number })}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onDownloadInvoice && (
            <button type="button" onClick={() => void onDownloadInvoice()} className={platformSecondaryBtnClass}>
              <Download size={14} />
              {t('platform.detail.pdf')}
            </button>
          )}
          <button type="button" onClick={() => void onCopy()} className={platformSecondaryBtnClass}>
            <Copy size={14} />
            {copied ? t('platform.subscriptions.copied') : t('platform.subscriptions.copy')}
          </button>
          <button type="button" onClick={onClose} className={platformPrimaryBtnClass}>
            {t('platform.subscriptions.codeDone')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RevealCodeModal({
  subscriptionId,
  onClose,
  onRevealed,
}: {
  subscriptionId: string;
  onClose: () => void;
  onRevealed: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [totpCode, setTotpCode] = useState('');
  const revealMutation = useMutation({
    mutationFn: () => revealPlatformActivationCode(subscriptionId, totpCode.trim()),
    onSuccess: (result) => onRevealed(result.activationCode),
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[175] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <form
        className={`${platformPanelClass} w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (revealMutation.isPending) return;
          revealMutation.mutate();
        }}
      >
        <h2 className="font-display text-lg font-semibold text-ops-ink">{t('platform.detail.revealTitle')}</h2>
        <p className={`mt-2 ${platformWarnClass}`}>{t('platform.detail.revealWarn')}</p>
        <div className="mt-4">
          <FieldLabel htmlFor="list-reveal-totp">{t('platform.login.totpCode')}</FieldLabel>
          <input
            id="list-reveal-totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={revealMutation.isPending}
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={platformInputClass}
          />
        </div>
        {revealMutation.error && (
          <p className={`${platformErrorClass} mt-3`}>
            {revealMutation.error instanceof Error ? revealMutation.error.message : t('platform.detail.revealFailed')}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={revealMutation.isPending} className={platformSecondaryBtnClass}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={revealMutation.isPending || totpCode.length !== 6}
            className={platformPrimaryBtnClass}
          >
            {revealMutation.isPending ? t('platform.status.working') : t('platform.detail.reveal')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
