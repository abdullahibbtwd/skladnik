import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Boxes, CreditCard, LayoutDashboard, LogOut, Menu, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { cn } from '../../lib/cn';
import { platformLogout } from '../../lib/platform-api';
import { platformAuthKeys, usePlatformMeQuery } from '../../lib/platform-session';
import { queryClient } from '../../lib/query-client';

const navItems = [
  { to: '/platform', end: true, icon: LayoutDashboard, labelKey: 'platform.nav.dashboard' as const },
  { to: '/platform/subscriptions', end: false, icon: CreditCard, labelKey: 'platform.nav.subscriptions' as const },
  { to: '/platform/settings', end: false, icon: Settings, labelKey: 'platform.nav.settings' as const },
];

function pageTitle(pathname: string, t: (key: string) => string) {
  if (pathname.startsWith('/platform/settings')) return t('platform.nav.settings');
  if (pathname.startsWith('/platform/subscriptions')) return t('platform.nav.subscriptions');
  return t('platform.nav.dashboard');
}

export function PlatformLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const meQuery = usePlatformMeQuery();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ops-canvas font-display text-sm text-slate-500">
        {t('platform.session.restoring')}
      </div>
    );
  }

  if (!meQuery.data) {
    return <Navigate to="/platform/login" replace />;
  }

  const logout = async () => {
    await platformLogout();
    queryClient.removeQueries({ queryKey: platformAuthKeys.me });
    navigate('/platform/login', { replace: true });
  };

  const initial = (meQuery.data.name?.trim()?.[0] || meQuery.data.email[0] || '?').toUpperCase();
  const title = pageTitle(location.pathname, t);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-display text-[0.86rem] font-medium transition-colors',
      isActive
        ? 'bg-ops-teal/10 text-ops-teal'
        : 'text-slate-600 hover:bg-ops-canvas hover:text-ops-ink',
    );

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link
        to="/platform"
        className="flex items-center gap-2.5 px-4 py-5 font-display text-[1.05rem] font-semibold tracking-tight text-ops-ink"
        onClick={() => setMobileNavOpen(false)}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.65rem] bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)]">
          <Boxes size={18} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate">Skladnik</span>
          <span className="block truncate font-sans text-[0.68rem] font-medium tracking-wide text-slate-400 uppercase">
            {t('platform.brand')}
          </span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={() => setMobileNavOpen(false)}>
            <item.icon size={17} strokeWidth={2} />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200/90 px-3 py-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 font-display text-[0.84rem] font-medium text-slate-600 transition-colors hover:bg-ops-canvas hover:text-ops-ink"
        >
          <LogOut size={16} />
          {t('platform.nav.logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-dvh bg-ops-canvas font-sans text-ops-ink antialiased">
      <div className="pointer-events-none fixed top-[-8rem] left-1/4 -z-10 size-[32rem] rounded-full bg-ops-teal/[0.07] blur-[120px]" />
      <div className="pointer-events-none fixed right-0 bottom-0 -z-10 size-[24rem] rounded-full bg-ops-accent/[0.05] blur-[110px]" />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-200/90 bg-white/95 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            aria-label={t('platform.nav.closeMenu')}
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(16.5rem,88vw)] border-r border-slate-200/90 bg-white shadow-[0_16px_40px_rgba(30,27,75,0.18)]">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-3.5 right-3 flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-ops-canvas hover:text-ops-ink"
              aria-label={t('platform.nav.closeMenu')}
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-ops-teal/30 hover:text-ops-teal lg:hidden"
              aria-label={t('platform.nav.openMenu')}
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[0.95rem] font-semibold tracking-tight text-ops-ink">{title}</p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitch compact />
              <div
                className="flex max-w-[14rem] items-center gap-2 rounded-full border border-slate-200 bg-ops-canvas/80 py-1 pr-2.5 pl-1"
                title={meQuery.data.email}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ops-teal font-display text-[0.72rem] font-semibold text-white">
                  {initial}
                </span>
                <span className="hidden truncate font-sans text-[0.78rem] text-slate-600 sm:inline">
                  {meQuery.data.email}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
