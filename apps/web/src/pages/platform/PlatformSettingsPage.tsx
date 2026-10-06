import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { GlassPanel } from '../../components/dashboard/dashboard-ui';
import {
  PlatformApiError,
  getPlatformBillingSettings,
  platformLogout,
  updatePlatformBillingSettings,
} from '../../lib/platform-api';
import { platformAuthKeys, usePlatformMeQuery } from '../../lib/platform-session';
import { queryClient } from '../../lib/query-client';
import {
  platformErrorClass,
  platformInputClass,
  platformLabelClass,
  platformPrimaryBtnClass,
  platformWarnClass,
} from './platform-ui';

const billingKeys = {
  all: ['platform', 'settings', 'billing'] as const,
};

export function PlatformSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meQuery = usePlatformMeQuery();
  const me = meQuery.data;

  const billingQuery = useQuery({
    queryKey: billingKeys.all,
    queryFn: getPlatformBillingSettings,
  });

  const [sellerName, setSellerName] = useState('');
  const [sellerEik, setSellerEik] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const data = billingQuery.data;
    if (!data) return;
    setSellerName(data.sellerName);
    setSellerEik(data.sellerEik);
    setSellerAddress(data.sellerAddress);
    setSellerEmail(data.sellerEmail);
  }, [billingQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePlatformBillingSettings({
        sellerName,
        sellerEik,
        sellerAddress,
        sellerEmail,
      }),
    onSuccess: async (data) => {
      setFormError(null);
      await qc.setQueryData(billingKeys.all, data);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: (err) => {
      setFormError(err instanceof PlatformApiError ? err.message : t('platform.settings.saveFailed'));
    },
  });

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    saveMutation.mutate();
  };

  const logout = async () => {
    await platformLogout();
    queryClient.removeQueries({ queryKey: platformAuthKeys.me });
    navigate('/platform/login', { replace: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <p className="font-display text-[0.72rem] font-medium tracking-wider text-ops-accent uppercase">
          {t('platform.brand')}
        </p>
        <h1 className="mt-1 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
          {t('platform.settings.title')}
        </h1>
        <p className="mt-1 max-w-xl font-sans text-[0.8rem] text-slate-500">{t('platform.settings.subtitle')}</p>
      </div>

      <GlassPanel title={t('platform.settings.profile')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={platformLabelClass} htmlFor="platform-settings-name">
              {t('platform.settings.name')}
            </label>
            <input
              id="platform-settings-name"
              className={platformInputClass}
              value={me?.name ?? ''}
              readOnly
              disabled
            />
          </div>
          <div>
            <label className={platformLabelClass} htmlFor="platform-settings-email">
              {t('platform.settings.email')}
            </label>
            <input
              id="platform-settings-email"
              className={platformInputClass}
              value={me?.email ?? ''}
              readOnly
              disabled
            />
          </div>
        </div>
        <p className="mt-3 font-sans text-[0.72rem] text-slate-400">{t('platform.settings.profileHint')}</p>
      </GlassPanel>

      <GlassPanel title={t('platform.settings.language')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md font-sans text-[0.8rem] text-slate-500">{t('platform.settings.languageHint')}</p>
          <LanguageSwitch />
        </div>
      </GlassPanel>

      <GlassPanel title={t('platform.settings.invoiceSeller')}>
        <p className="mb-4 font-sans text-[0.8rem] text-slate-500">{t('platform.settings.invoiceSellerHint')}</p>
        {billingQuery.isError ? (
          <div className={platformErrorClass}>
            {billingQuery.error instanceof PlatformApiError
              ? billingQuery.error.message
              : t('platform.settings.loadFailed')}
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSave}>
            {!billingQuery.isLoading && billingQuery.data && !billingQuery.data.configured ? (
              <div className={platformWarnClass}>
                <p className="font-sans text-[0.78rem] leading-relaxed">{t('platform.settings.invoiceSellerIncomplete')}</p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={platformLabelClass} htmlFor="seller-name">
                  {t('platform.settings.sellerName')}
                </label>
                <input
                  id="seller-name"
                  className={platformInputClass}
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  disabled={billingQuery.isLoading || saveMutation.isPending}
                  required
                  autoComplete="organization"
                />
              </div>
              <div>
                <label className={platformLabelClass} htmlFor="seller-eik">
                  {t('platform.settings.sellerEik')}
                </label>
                <input
                  id="seller-eik"
                  className={platformInputClass}
                  value={sellerEik}
                  onChange={(e) => setSellerEik(e.target.value)}
                  disabled={billingQuery.isLoading || saveMutation.isPending}
                  required
                />
              </div>
            </div>
            <div>
              <label className={platformLabelClass} htmlFor="seller-address">
                {t('platform.settings.sellerAddress')}
              </label>
              <input
                id="seller-address"
                className={platformInputClass}
                value={sellerAddress}
                onChange={(e) => setSellerAddress(e.target.value)}
                disabled={billingQuery.isLoading || saveMutation.isPending}
                required
                autoComplete="street-address"
              />
            </div>
            <div>
              <label className={platformLabelClass} htmlFor="seller-email">
                {t('platform.settings.sellerEmail')}
              </label>
              <input
                id="seller-email"
                type="email"
                className={platformInputClass}
                value={sellerEmail}
                onChange={(e) => setSellerEmail(e.target.value)}
                disabled={billingQuery.isLoading || saveMutation.isPending}
                required
                autoComplete="email"
              />
            </div>
            {formError ? <div className={platformErrorClass}>{formError}</div> : null}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className={platformPrimaryBtnClass}
                disabled={billingQuery.isLoading || saveMutation.isPending}
              >
                <Save size={16} />
                {saveMutation.isPending ? t('platform.settings.saving') : t('platform.settings.save')}
              </button>
              {savedFlash ? (
                <p className="font-sans text-[0.78rem] text-ops-teal">{t('platform.settings.saved')}</p>
              ) : null}
            </div>
          </form>
        )}
      </GlassPanel>

      <GlassPanel title={t('platform.settings.session')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md font-sans text-[0.8rem] text-slate-500">{t('platform.settings.sessionHint')}</p>
          <button type="button" onClick={() => void logout()} className={platformPrimaryBtnClass}>
            <LogOut size={16} />
            {t('platform.nav.logout')}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
