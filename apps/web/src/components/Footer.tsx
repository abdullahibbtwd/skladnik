import React from 'react';
import { Link } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 bg-ops-canvas pt-12 pb-8 text-slate-500 md:pt-[4.5rem] md:pb-10">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="mb-10 grid grid-cols-1 gap-8 md:mb-14 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.2fr] lg:gap-12">
          <div>
            <div className="mb-[0.85rem] flex items-center gap-[0.6rem] font-display text-lg font-semibold text-ops-ink md:text-xl">
              <div className="flex size-8 items-center justify-center rounded-lg bg-ops-teal text-white">
                <Boxes size={18} />
              </div>
              <span>Skladnik</span>
            </div>
            <p className="mb-5 max-w-80 text-[0.9rem] leading-relaxed">{t('footer.blurb')}</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-ops-teal/20 bg-teal-50 px-[0.7rem] py-[0.3rem] text-[0.78rem] font-medium text-ops-teal">
              <span className="size-2 animate-pulse-dot rounded-full bg-ops-teal shadow-[0_0_8px_#0d9488]" />
              <span>{t('footer.status')}</span>
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
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.haccp')}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.encryption')}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm transition-colors hover:text-ops-ink">
                  {t('footer.privacy')}
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
          <div className="flex gap-6">
            <a href="#" className="hover:text-ops-ink">
              {t('footer.terms')}
            </a>
            <a href="#" className="hover:text-ops-ink">
              {t('footer.security')}
            </a>
            <a href="#" className="hover:text-ops-ink">
              {t('footer.systemStatus')}
            </a>
            <a href="#" className="hover:text-ops-ink">
              {t('footer.support')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
