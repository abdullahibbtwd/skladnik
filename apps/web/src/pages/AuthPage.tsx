import React, { useEffect } from 'react';
import { ArrowLeft, Boxes, Camera, FileCheck2, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useTranslation } from 'react-i18next';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onSuccess }) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const inviteToken = mode === 'signup' ? searchParams.get('invite') : null;
  const highlights = [
    { icon: Camera, title: t('auth.h1Title'), copy: t('auth.h1Copy') },
    { icon: ShieldCheck, title: t('auth.h2Title'), copy: t('auth.h2Copy') },
    { icon: FileCheck2, title: t('auth.h3Title'), copy: t('auth.h3Copy') },
  ];
  useEffect(() => {
    document.title = mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle');
    return () => {
      document.title = t('auth.homeTitle');
    };
  }, [mode, t]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ops-canvas font-sans text-ops-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-ops-teal/[0.08] blur-[120px]" />
        <div className="absolute top-1/3 -right-24 size-[22rem] rounded-full bg-ops-accent/[0.08] blur-[110px]" />
        <div className="absolute -bottom-24 left-1/4 size-[18rem] rounded-full bg-ops-ai/[0.06] blur-[90px]" />
      </div>

      <div className="relative grid min-h-dvh lg:grid-cols-2">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-200 bg-white px-12 py-10 lg:flex xl:px-16">
          <Link to="/" className="inline-flex w-fit items-center gap-3 font-display text-[1.2rem] font-semibold tracking-tight text-ops-ink">
            <span className="flex size-10 items-center justify-center rounded-[0.7rem] bg-ops-teal text-white shadow-[0_8px_24px_rgba(13,148,136,0.28)]">
              <Boxes size={18} strokeWidth={2} />
            </span>
            Skladnik
          </Link>

          <div className="max-w-md">
            <span className="mb-5 inline-flex items-center rounded-full border border-ops-teal/20 bg-teal-50 px-3 py-1 font-display text-[0.72rem] font-medium text-ops-teal">
              {t('auth.heroBadge')}
            </span>
            <h1 className="mb-4 font-display text-[2.55rem] leading-[1.12] font-semibold tracking-tight text-ops-ink">
              {t('auth.heroTitle1')}
              <br />
              <span className="text-ops-teal">{t('auth.heroTitle2')}</span>
            </h1>
            <p className="mb-9 max-w-[28rem] font-sans text-[0.98rem] leading-relaxed text-slate-500">
              {t('auth.heroBody')}
            </p>
            <ul className="flex flex-col gap-3.5">
              {highlights.map((item) => (
                <li key={item.title} className="flex gap-3.5 rounded-xl border border-slate-200 bg-ops-canvas px-4 py-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-ops-teal/20 bg-teal-50 text-ops-teal">
                    <item.icon size={16} />
                  </span>
                  <span>
                    <span className="block font-display text-sm font-medium text-ops-ink">{item.title}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-slate-500">{item.copy}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-slate-500">{t('auth.builtFor')}</p>
        </section>

        <section className="relative flex flex-col px-4 py-5 sm:px-8 sm:py-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2.5 font-display text-[1.1rem] font-semibold text-ops-ink lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-[0.6rem] bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)]">
                <Boxes size={16} />
              </span>
              Skladnik
            </Link>
            <div className="ml-auto flex items-center gap-2">
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

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center pb-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_-12px_rgba(30,27,75,0.12)] sm:p-8">
              <div className="mb-6 grid grid-cols-2 rounded-full border border-slate-200 bg-ops-canvas p-1">
                <Link
                  to="/login"
                  className={`rounded-full px-3 py-2 text-center font-display text-[0.85rem] font-medium transition-all ${
                    mode === 'login'
                      ? 'bg-white text-ops-ink shadow-[0_4px_12px_rgba(30,27,75,0.08)]'
                      : 'text-slate-500 hover:text-ops-ink'
                  }`}
                >
                  {t('auth.loginTab')}
                </Link>
                <Link
                  to="/signup"
                  className={`rounded-full px-3 py-2 text-center font-display text-[0.85rem] font-medium transition-all ${
                    mode === 'signup'
                      ? 'bg-white text-ops-ink shadow-[0_4px_12px_rgba(30,27,75,0.08)]'
                      : 'text-slate-500 hover:text-ops-ink'
                  }`}
                >
                  {t('auth.signupTab')}
                </Link>
              </div>

              <AuthForm
                mode={mode}
                inviteToken={inviteToken}
                onSuccess={onSuccess}
                idPrefix={`page-${mode}`}
                variant="page"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
