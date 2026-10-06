import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Boxes, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { FieldLabel, PasswordField } from '../../components/PasswordField';
import {
  platformConfirmTotp,
  platformEnrollTotp,
  platformLogin,
  platformVerifyTotp,
} from '../../lib/platform-api';
import { platformAuthKeys, usePlatformMeQuery } from '../../lib/platform-session';
import { queryClient } from '../../lib/query-client';
import {
  platformErrorClass,
  platformInputClass,
  platformLabelClass,
  platformPanelClass,
  platformPrimaryBtnClass,
  platformWarnClass,
} from './platform-ui';

type Step = 'password' | 'totp' | 'enroll';

export function PlatformLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const meQuery = usePlatformMeQuery();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = t('platform.login.title');
  }, [t]);

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
        {t('platform.session.restoring')}
      </div>
    );
  }

  if (meQuery.data) {
    return <Navigate to="/platform" replace />;
  }

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: platformAuthKeys.me });
    navigate('/platform', { replace: true });
  };

  const onPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await platformLogin(email.trim(), password);
      if (result.status === 'TOTP_REQUIRED') {
        setStep('totp');
      } else {
        const enroll = await platformEnrollTotp();
        setSecret(enroll.secret);
        setOtpauthUrl(enroll.otpauthUrl);
        setStep('enroll');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('platform.login.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onTotp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'enroll') {
        await platformConfirmTotp(code.trim());
      } else {
        await platformVerifyTotp(code.trim());
      }
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('platform.login.totpFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ops-canvas font-sans text-ops-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-ops-teal/[0.08] blur-[120px]" />
        <div className="absolute top-1/3 -right-24 size-[22rem] rounded-full bg-ops-accent/[0.08] blur-[110px]" />
        <div className="absolute -bottom-24 left-1/4 size-[18rem] rounded-full bg-ops-ai/[0.06] blur-[90px]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-4 py-5 sm:px-8 sm:py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2.5 font-display text-[1.1rem] font-semibold text-ops-ink">
            <span className="flex size-8 items-center justify-center rounded-[0.6rem] bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)]">
              <Boxes size={16} />
            </span>
            Skladnik
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch compact />
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-[0.55rem] font-display text-[0.82rem] font-medium text-ops-ink shadow-[0_8px_24px_rgba(30,27,75,0.06)] transition-all hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent"
            >
              <ArrowLeft size={15} strokeWidth={2} />
              {t('auth.backHome')}
            </Link>
          </div>
        </div>

        <div className={`my-auto ${platformPanelClass} p-5 sm:p-8`}>
          <div className="mb-6">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-ops-teal/20 bg-teal-50 px-3 py-1 font-display text-[0.72rem] font-medium text-ops-teal">
              <ShieldCheck size={12} strokeWidth={2.2} />
              {t('platform.brand')}
            </span>
            <h1 className="font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
              {step === 'password' ? t('platform.login.heading') : t('platform.login.totpHeading')}
            </h1>
            <p className="mt-1.5 font-sans text-[0.9rem] leading-relaxed text-slate-500">
              {step === 'password'
                ? t('platform.login.sub')
                : step === 'enroll'
                  ? t('platform.login.enrollSub')
                  : t('platform.login.totpSub')}
            </p>
          </div>

          {step === 'password' ? (
            <form className="flex flex-col gap-4" onSubmit={(e) => void onPassword(e)}>
              <div>
                <FieldLabel htmlFor="platform-email">{t('platform.login.email')}</FieldLabel>
                <input
                  id="platform-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={platformInputClass}
                />
              </div>
              <PasswordField
                label={t('platform.login.password')}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
              {error && <p className={platformErrorClass}>{error}</p>}
              <button type="submit" disabled={busy} className={`${platformPrimaryBtnClass} mt-1 w-full`}>
                {busy ? t('platform.login.working') : t('platform.login.continue')}
              </button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => void onTotp(e)}>
              {step === 'enroll' && (
                <div className={platformWarnClass}>
                  <p className="font-display font-medium">{t('platform.login.enrollWarn')}</p>
                  {otpauthUrl && (
                    <p className="mt-2 break-all font-mono text-[0.7rem] text-ops-warn/80">{otpauthUrl}</p>
                  )}
                  {secret && (
                    <p className="mt-2">
                      <span className="text-ops-warn/80">{t('platform.login.manualSecret')}: </span>
                      <span className="font-mono tracking-wider text-ops-ink">{secret}</span>
                    </p>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="platform-totp" className={platformLabelClass}>
                  {t('platform.login.totpCode')}
                </label>
                <input
                  id="platform-totp"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`${platformInputClass} font-mono text-lg tracking-[0.35em]`}
                />
              </div>
              {error && <p className={platformErrorClass}>{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className={`${platformPrimaryBtnClass} w-full`}
              >
                {busy ? t('platform.login.working') : t('platform.login.verify')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
