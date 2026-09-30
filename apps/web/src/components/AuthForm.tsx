import React, { useEffect, useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GoogleSignInButton } from './GoogleSignInButton';
import { FieldError, FieldLabel, PasswordField, textFieldClass } from './PasswordField';
import { useLoginMutation, useSignupMutation, useSignupWithInviteMutation } from '../lib/auth-session';
import { useInvitePreviewQuery } from '../lib/workspace-session';
import { useTranslation } from 'react-i18next';

type AuthMode = 'signup' | 'login';

interface AuthFormProps {
  mode: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  inviteToken?: string | null;
  onSuccess: () => void;
  idPrefix: string;
  variant: 'page' | 'modal';
}

export const AuthForm: React.FC<AuthFormProps> = ({
  mode,
  onModeChange,
  inviteToken = null,
  onSuccess,
  idPrefix,
  variant,
}) => {
  const { t } = useTranslation();
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const login = useLoginMutation();
  const signup = useSignupMutation();
  const signupInvite = useSignupWithInviteMutation();
  const inviteQuery = useInvitePreviewQuery(mode === 'signup' ? inviteToken : null);
  const loading = login.isPending || signup.isPending || signupInvite.isPending;
  const invite = inviteQuery.data ?? null;

  useEffect(() => {
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setGoogleError(null);
  }, [mode]);

  useEffect(() => {
    if (invite?.email) setEmail(invite.email);
  }, [invite?.email]);

  const mismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    try {
      if (mode === 'signup') {
        if (inviteToken) {
          if (!invite) {
            setError(t('auth.inviteNotValid'));
            return;
          }
          await signupInvite.mutateAsync({
            token: inviteToken,
            email: invite.email,
            password,
            name: storeName.trim(),
          });
        } else {
          await signup.mutateAsync({
            email: email.trim(),
            password,
            name: storeName.trim(),
            companyName: storeName.trim(),
          });
        }
      } else {
        await login.mutateAsync({ email: email.trim(), password });
      }
      onSuccess();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('auth.genericError'));
    }
  };

  return (
    <div>
      <div className="mb-6">
        {mode === 'signup' ? (
          inviteToken ? (
            <>
              <h2 className="mb-1.5 font-display text-[1.35rem] leading-tight font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
                {t('auth.joinTitle', { name: invite?.companyName ?? '…' })}
              </h2>
              <p className="font-sans text-[0.9rem] text-slate-500">
                {invite
                  ? t('auth.joinBody', { company: invite.companyName, role: t(`labels.role.${invite.role}`) })
                  : inviteQuery.isPending
                    ? t('auth.checkingInvite')
                    : t('auth.invalidInvite')}
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 font-display text-[1.35rem] leading-tight font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
                {t('auth.createTitle')}
              </h2>
              <p className="font-sans text-[0.9rem] text-slate-500">
                {t('auth.createBody')}
              </p>
            </>
          )
        ) : (
          <>
            <h2 className="mb-1.5 font-display text-[1.35rem] leading-tight font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
              {t('auth.loginHeading')}
            </h2>
            <p className="font-sans text-[0.9rem] text-slate-500">{t('auth.loginBody')}</p>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <div>
            <FieldLabel htmlFor={`${idPrefix}-storeName`}>{inviteToken ? t('auth.yourName') : t('auth.storeName')}</FieldLabel>
            <div className="relative">
              <div className="pointer-events-none absolute top-1/2 left-[0.85rem] -translate-y-1/2 text-slate-400">
                <Store size={16} />
              </div>
              <input
                id={`${idPrefix}-storeName`}
                type="text"
                required
                value={storeName}
                autoComplete="organization"
                placeholder={inviteToken ? t('auth.namePlaceholder') : t('auth.storePlaceholder')}
                onChange={(event) => setStoreName(event.target.value)}
                className={textFieldClass}
              />
            </div>
          </div>
        )}

        <div>
          <FieldLabel htmlFor={`${idPrefix}-email`}>{t('auth.email')}</FieldLabel>
          <div className="relative">
            <div className="pointer-events-none absolute top-1/2 left-[0.85rem] -translate-y-1/2 text-slate-400">
              <Mail size={16} />
            </div>
            <input
              id={`${idPrefix}-email`}
              type="email"
              required
              value={email}
              readOnly={Boolean(inviteToken && invite)}
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              onChange={(event) => setEmail(event.target.value)}
              className={textFieldClass}
            />
          </div>
        </div>

        <div>
          <PasswordField
            id={`${idPrefix}-password`}
            label={t('auth.password')}
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={setPassword}
          />
          {mode === 'login' && (
            <p className="mt-1.5 text-right">
              <Link
                to="/forgot-password"
                className="font-display text-[0.78rem] font-medium text-ops-teal hover:underline"
              >
                {t('auth.forgotPassword')}
              </Link>
            </p>
          )}
        </div>

        {mode === 'signup' && (
          <div>
            <PasswordField
              id={`${idPrefix}-confirm`}
              label={t('auth.confirmPassword')}
              value={confirmPassword}
              autoComplete="new-password"
              placeholder={t('auth.reenterPassword')}
              onChange={setConfirmPassword}
            />
            {mismatch && <FieldError>{t('auth.passwordMismatch')}</FieldError>}
          </div>
        )}

        {error && <FieldError>{error}</FieldError>}
        {googleError && <FieldError>{googleError}</FieldError>}

        <button
          type="submit"
          disabled={loading || mismatch || Boolean(inviteToken && (inviteQuery.isPending || inviteQuery.isError))}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.95rem] font-medium text-white shadow-[0_10px_24px_rgba(13,148,136,0.22)] transition-all hover:bg-ops-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span>{mode === 'signup' ? (inviteToken ? t('auth.joining') : t('auth.creating')) : t('auth.signingIn')}</span>
          ) : mode === 'signup' ? (
            inviteToken ? (
              <>
                <ArrowRight size={16} />
                {t('auth.joinCompany', { name: invite?.companyName ?? '…' })}
              </>
            ) : (
              <>
                <ArrowRight size={16} />
                {t('auth.createFree')}
              </>
            )
          ) : (
            <>
              <ShieldCheck size={16} />
              {t('auth.loginDashboard')}
            </>
          )}
        </button>

        {!inviteToken && (
          <GoogleSignInButton
            mode={mode}
            onSuccess={onSuccess}
            onError={(message) => {
              setError(null);
              setGoogleError(message);
            }}
          />
        )}
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4 text-center font-sans text-[0.82rem] text-slate-500">
        {mode === 'signup' ? (
          <p>
            {t('auth.haveAccount')}{' '}
            {onModeChange ? (
              <button type="button" onClick={() => onModeChange('login')} className="p-0 font-display font-medium text-ops-teal hover:underline">
                {t('auth.loginTab')}
              </button>
            ) : (
              <Link to="/login" className="font-display font-medium text-ops-teal hover:underline">
                {t('auth.loginTab')}
              </Link>
            )}
          </p>
        ) : (
          <p>
            {t('auth.noAccount')}{' '}
            {onModeChange ? (
              <button type="button" onClick={() => onModeChange('signup')} className="p-0 font-display font-medium text-ops-teal hover:underline">
                {t('auth.signupFree')}
              </button>
            ) : (
              <Link to="/signup" className="font-display font-medium text-ops-teal hover:underline">
                {t('auth.signupFree')}
              </Link>
            )}
          </p>
        )}

        {variant === 'modal' && (
          <p className="mt-2.5">
            {t('auth.preferFullPage')}{' '}
            <Link to={mode === 'login' ? '/login' : '/signup'} className="font-display font-medium text-ops-accent hover:underline">
              {mode === 'login' ? t('auth.openLogin') : t('auth.openSignup')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};
