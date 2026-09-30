import React, { useEffect, useRef, useState } from 'react';
import { useAuthProvidersQuery, useGoogleAuthMutation } from '../lib/auth-session';
import { FieldError } from './PasswordField';
import { useTranslation } from 'react-i18next';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

type GoogleSignInButtonProps = {
  mode: 'login' | 'signup';
  onSuccess: () => void;
  onError: (message: string) => void;
};

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ mode, onSuccess, onError }) => {
  const { t, i18n } = useTranslation();
  const providers = useAuthProvidersQuery();
  const googleAuth = useGoogleAuthMutation();
  const hostRef = useRef<HTMLDivElement>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const [scriptReady, setScriptReady] = useState(Boolean(window.google?.accounts?.id));
  const clientId = providers.data?.googleClientId ?? null;

  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!clientId || scriptReady) return;
    const existing = document.querySelector<HTMLScriptElement>('script[data-skladnik-google-gsi]');
    if (existing) {
      if (window.google?.accounts?.id) setScriptReady(true);
      else existing.addEventListener('load', () => setScriptReady(true), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.skladnikGoogleGsi = '1';
    script.addEventListener('load', () => setScriptReady(true), { once: true });
    script.addEventListener('error', () => onErrorRef.current(t('auth.googleLoadFailed')), { once: true });
    document.head.appendChild(script);
  }, [clientId, scriptReady, t]);

  useEffect(() => {
    if (!clientId || !scriptReady || !hostRef.current || !window.google?.accounts?.id) return;

    const host = hostRef.current;
    host.innerHTML = '';

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        void (async () => {
          try {
            await googleAuth.mutateAsync(response.credential);
            onSuccessRef.current();
          } catch (error) {
            onErrorRef.current(error instanceof Error ? error.message : t('auth.genericError'));
          }
        })();
      },
      ux_mode: 'popup',
    });

    const width = Math.min(360, Math.max(240, Math.floor(host.getBoundingClientRect().width || 320)));
    window.google.accounts.id.renderButton(host, {
      theme: 'outline',
      size: 'large',
      text: mode === 'signup' ? 'signup_with' : 'signin_with',
      shape: 'rectangular',
      width,
      locale: i18n.language?.startsWith('bg') ? 'bg' : 'en',
    });
  }, [clientId, googleAuth.mutateAsync, i18n.language, mode, scriptReady, t]);

  if (!clientId) return null;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="font-display text-[0.72rem] font-medium tracking-wide text-slate-400 uppercase">
          {t('auth.orContinueWith')}
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div ref={hostRef} className="flex min-h-[40px] justify-center" />
      {googleAuth.isPending && (
        <p className="mt-2 text-center font-sans text-[0.78rem] text-slate-500">{t('auth.googleSigningIn')}</p>
      )}
    </div>
  );
};

export function GoogleSignInError({ message }: { message: string | null }) {
  if (!message) return null;
  return <FieldError>{message}</FieldError>;
}
