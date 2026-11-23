import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from './BrandLogo';

const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61597048912397';

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.84c0-2.37 1.4-3.69 3.56-3.69 1.03 0 2.11.19 2.11.19v2.33h-1.19c-1.17 0-1.54.73-1.54 1.48v1.78h2.62l-.42 2.91h-2.2V22c4.78-.75 8.44-4.91 8.44-9.93z" />
    </svg>
  );
}

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 bg-ops-canvas pt-12 pb-8 text-slate-500 md:pt-[4.5rem] md:pb-10">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mb-10 grid grid-cols-1 gap-8 md:mb-14 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.2fr] lg:gap-12">
          <div>
            <div className="mb-[0.85rem]">
              <BrandLogo className="h-8" />
            </div>
            <p className="mb-5 max-w-80 text-[0.9rem] leading-relaxed">{t('footer.blurb')}</p>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-ops-teal/20 bg-teal-50 px-[0.7rem] py-[0.3rem] text-[0.78rem] font-medium text-ops-teal">
              <span className="size-2 animate-pulse-dot rounded-full bg-ops-teal shadow-[0_0_8px_#0d9488]" />
              <span>{t('footer.status')}</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-9 items-center justify-center rounded-full border border-[#1877F2]/30 text-[#1877F2] transition-colors hover:border-[#1877F2]/50 hover:bg-[#1877F2]/5"
                aria-label={t('footer.facebook')}
              >
                <FacebookIcon className="size-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-[0.82rem] font-medium tracking-wide text-ops-ink md:mb-5">{t('footer.platform')}</h4>
            <ul className="flex list-none flex-col gap-3">
              <li>
                <a href="#features" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.snapStock')}
                </a>
              </li>
              <li>
                <a href="#features" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.fefoBoard')}
                </a>
              </li>
              <li>
                <a href="#compliance" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.annexReady')}
                </a>
              </li>
              <li>
                <a href="#features" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.mobileScan')}
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.storePlans')}
                </a>
              </li>
              <li>
                <Link to="/login" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.login')}
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.createAccount')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-display text-[0.82rem] font-medium tracking-wide text-ops-ink md:mb-5">{t('footer.compliance')}</h4>
            <ul className="flex list-none flex-col gap-3">
              <li>
                <a href="#compliance" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.annexXml')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-display text-[0.82rem] font-medium tracking-wide text-ops-ink md:mb-5">{t('footer.compatibility')}</h4>
            <p className="mb-[0.85rem] text-[0.85rem] leading-normal text-slate-500">{t('footer.compatibleWith')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-8 text-[0.825rem] text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} {t('footer.rights')}
          </div>
        </div>
      </div>
    </footer>
  );
};
