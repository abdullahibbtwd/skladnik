import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Boxes, Mail, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { FieldError, FieldLabel, PasswordField, textFieldClass } from '../components/PasswordField';
import { useForgotPasswordMutation, useResetPasswordMutation } from '../lib/auth-session';
import { useTranslation } from 'react-i18next';

type PasswordResetPageProps = {
  mode: 'forgot' | 'reset';
};

export const PasswordResetPage: React.FC<PasswordResetPageProps> = ({ mode }) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const forgot = useForgotPasswordMutation();
  const reset = useResetPasswordMutation();
  const loading = forgot.isPending || reset.isPending;
  const mismatch = mode === 'reset' && confirmPassword.length > 0 && password !== confirmPassword;

  useEffect(() => {
    document.title = mode === 'forgot' ? t('auth.forgotTitle') : t('auth.resetTitle');
    return () => {
      document.title = t('auth.homeTitle');
    };
  }, [mode, t]);

  const handleForgot = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDevResetUrl(null);
    try {
      const result = await forgot.mutateAsync(email.trim());
      setSent(true);
      if (result.resetUrl) setDevResetUrl(result.resetUrl);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('auth.genericError'));
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError(t('auth.resetLinkInvalid'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    try {
      await reset.mutateAsync({ token, password });
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('auth.genericError'));
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ops-canvas font-sans text-ops-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-ops-teal/[0.08] blur-[120px]" />
        <div className="absolute top-1/3 -right-24 size-[22rem] rounded-full bg-ops-accent/[0.08] blur-[110px]" />
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
              to="/login"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-[0.55rem] font-display text-[0.82rem] font-medium text-ops-ink shadow-[0_8px_24px_rgba(30,27,75,0.06)] transition-all hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent"
            >
              <ArrowLeft size={15} strokeWidth={2} />
              {t('auth.loginTab')}
            </Link>
          </div>
        </div>

        <div className="my-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_-12px_rgba(30,27,75,0.12)] sm:p-8">
          {mode === 'forgot' ? (
            sent ? (
              <div>
                <h1 className="mb-1.5 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
                  {t('auth.forgotSentTitle')}
                </h1>
                <p className="font-sans text-[0.9rem] text-slate-500">{t('auth.forgotSentBody')}</p>
                {devResetUrl && (
                  <p className="mt-4 break-all rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-[0.75rem] text-amber-900">
                    {t('auth.devResetLink')}:{' '}
                    <a href={devResetUrl} className="font-medium underline">
                      {devResetUrl}
                    </a>
                  </p>
                )}
                <Link
                  to="/login"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.95rem] font-medium text-white"
                >
                  {t('auth.backToLogin')}
                </Link>
              </div>
            ) : (
              <div>
                <h1 className="mb-1.5 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
                  {t('auth.forgotHeading')}
                </h1>
                <p className="mb-6 font-sans text-[0.9rem] text-slate-500">{t('auth.forgotBody')}</p>
                <form onSubmit={handleForgot} className="flex flex-col gap-4">
                  <div>
                    <FieldLabel htmlFor="forgot-email">{t('auth.email')}</FieldLabel>
                    <div className="relative">
                      <div className="pointer-events-none absolute top-1/2 left-[0.85rem] -translate-y-1/2 text-slate-400">
                        <Mail size={16} />
                      </div>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={email}
                        autoComplete="email"
                        placeholder={t('auth.emailPlaceholder')}
                        onChange={(event) => setEmail(event.target.value)}
                        className={textFieldClass}
                      />
                    </div>
                  </div>
                  {error && <FieldError>{error}</FieldError>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.95rem] font-medium text-white shadow-[0_10px_24px_rgba(13,148,136,0.22)] transition-all hover:bg-ops-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? t('auth.sendingReset') : (
                      <>
                        <ArrowRight size={16} />
                        {t('auth.sendResetLink')}
                      </>
                    )}
                  </button>
                </form>
              </div>
            )
          ) : done ? (
            <div>
              <h1 className="mb-1.5 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
                {t('auth.resetDoneTitle')}
              </h1>
              <p className="font-sans text-[0.9rem] text-slate-500">{t('auth.resetDoneBody')}</p>
              <Link
                to="/login"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.95rem] font-medium text-white"
              >
                <ShieldCheck size={16} />
                {t('auth.backToLogin')}
              </Link>
            </div>
          ) : (
            <div>
              <h1 className="mb-1.5 font-display text-[1.35rem] font-semibold tracking-tight text-ops-ink">
                {t('auth.resetHeading')}
              </h1>
              <p className="mb-6 font-sans text-[0.9rem] text-slate-500">{t('auth.resetBody')}</p>
              {!token && <FieldError>{t('auth.resetLinkInvalid')}</FieldError>}
              <form onSubmit={handleReset} className="mt-4 flex flex-col gap-4">
                <PasswordField
                  id="reset-password"
                  label={t('auth.newPassword')}
                  value={password}
                  autoComplete="new-password"
                  onChange={setPassword}
                />
                <div>
                  <PasswordField
                    id="reset-confirm"
                    label={t('auth.confirmPassword')}
                    value={confirmPassword}
                    autoComplete="new-password"
                    placeholder={t('auth.reenterPassword')}
                    onChange={setConfirmPassword}
                  />
                  {mismatch && <FieldError>{t('auth.passwordMismatch')}</FieldError>}
                </div>
                {error && <FieldError>{error}</FieldError>}
                <button
                  type="submit"
                  disabled={loading || mismatch || !token}
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.95rem] font-medium text-white shadow-[0_10px_24px_rgba(13,148,136,0.22)] transition-all hover:bg-ops-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t('auth.savingPassword') : (
                    <>
                      <ShieldCheck size={16} />
                      {t('auth.saveNewPassword')}
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
