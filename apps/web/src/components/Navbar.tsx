import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Camera, Menu, X, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/cn';
import { useLogout } from '../lib/auth-session';
import { useAuthUser } from '../lib/auth-store';

interface NavbarProps {
  onOpenDemo: () => void;
}

const navLinkClass =
  'font-display text-[0.925rem] font-medium text-slate-500 transition-colors hover:text-ops-ink';

const ghostBtnClass =
  'rounded-lg px-[1.1rem] py-[0.6rem] font-display text-[0.925rem] font-medium text-ops-ink transition-all hover:bg-ops-canvas';

const signupBtnClass =
  'cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-[0.55rem] font-display text-[0.88rem] font-medium text-ops-ink transition-all hover:border-ops-accent/30 hover:bg-indigo-50 hover:text-ops-accent';

const primaryBtnClass =
  'items-center gap-2 rounded-lg bg-ops-teal px-5 py-[0.65rem] font-display text-[0.925rem] font-medium text-white shadow-[0_4px_14px_rgba(13,148,136,0.25)] transition-all hover:bg-ops-teal-hover';

export const Navbar: React.FC<NavbarProps> = ({ onOpenDemo }) => {
  const user = useAuthUser();
  const logout = useLogout();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[80] border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
          <div className="flex h-[4.5rem] items-center justify-between gap-3">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 font-display text-[1.1rem] font-semibold tracking-tight text-ops-ink md:gap-3 md:text-[1.25rem]">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-ops-teal text-white shadow-[0_4px_14px_rgba(13,148,136,0.28)] md:size-10">
                <Boxes size={18} strokeWidth={2} />
              </div>
              <span>Skladnik</span>
            </Link>

            <nav className="hidden lg:block">
              <ul className="flex list-none items-center gap-8">
                <li>
                  <a href="#features" className={navLinkClass}>
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className={navLinkClass}>
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#compliance" className={navLinkClass}>
                    Annex 38 Ready
                  </a>
                </li>
                <li>
                  <a href="#pricing" className={navLinkClass}>
                    Pricing
                  </a>
                </li>
              </ul>
            </nav>

            <div className="flex items-center gap-2 md:gap-4">
              {user ? (
                <>
                  <Link
                    to="/app"
                    className="hidden items-center gap-1.5 rounded-lg border border-ops-teal/25 bg-teal-50 px-[0.85rem] py-2 font-display text-[0.85rem] font-medium text-ops-teal lg:inline-flex"
                  >
                    <ShieldCheck size={16} />
                    <span className="max-w-[10rem] truncate">{user.companyName}</span>
                  </Link>
                  <button onClick={() => logout.mutate()} className={cn(ghostBtnClass, 'hidden px-3 py-2 text-[0.85rem] lg:inline-flex')}>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className={cn(ghostBtnClass, 'hidden lg:inline-flex')}>
                    Login
                  </Link>
                  <Link to="/signup" className={cn(signupBtnClass, 'hidden lg:inline-flex')}>
                    Sign Up Free
                  </Link>
                  <button onClick={onOpenDemo} className={cn(primaryBtnClass, 'hidden lg:inline-flex')}>
                    <Camera size={15} strokeWidth={2} />
                    <span>Scan Demo</span>
                  </button>
                </>
              )}

              <button
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-ops-canvas hover:text-ops-ink lg:hidden"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-drawer"
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        className={cn(
          'fixed inset-x-0 top-[4.5rem] bottom-0 z-[60] bg-ops-ink/20 transition-opacity duration-300 lg:hidden',
          mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={closeMobileMenu}
        aria-hidden={!mobileMenuOpen}
      />

      <aside
        id="mobile-nav-drawer"
        className={cn(
          'fixed top-[4.5rem] right-0 z-[61] flex h-[calc(100dvh-4.5rem)] w-[min(20.5rem,86vw)] flex-col gap-5 border-l border-slate-200 bg-white px-[1.35rem] py-5 shadow-[-18px_0_40px_rgba(30,27,75,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden',
          mobileMenuOpen ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        aria-hidden={!mobileMenuOpen}
      >
        <ul className="flex flex-1 list-none flex-col gap-[0.85rem]">
          {[
            ['#features', 'Features'],
            ['#how-it-works', 'How It Works'],
            ['#compliance', 'Annex 38 Ready'],
            ['#pricing', 'Pricing'],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="block py-[0.35rem] font-display text-base font-medium text-ops-ink transition-colors hover:text-ops-accent"
                onClick={closeMobileMenu}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-[0.65rem] border-t border-slate-100 pt-3">
          {user ? (
            <>
              <Link
                to="/app"
                onClick={closeMobileMenu}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-ops-teal/25 bg-teal-50 px-4 py-[0.65rem] font-display text-[0.88rem] font-medium text-ops-teal"
              >
                <ShieldCheck size={16} />
                <span>{user.companyName} (Open Dashboard)</span>
              </Link>
              <button
                onClick={() => {
                  closeMobileMenu();
                  logout.mutate();
                }}
                className={cn(ghostBtnClass, 'inline-flex justify-center text-center')}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <div className="flex w-full gap-2">
                <Link
                  to="/login"
                  onClick={closeMobileMenu}
                  className={cn(ghostBtnClass, 'inline-flex flex-1 justify-center border border-slate-200 py-[0.65rem] text-[0.9rem]')}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  onClick={closeMobileMenu}
                  className={cn(signupBtnClass, 'inline-flex flex-1 justify-center')}
                >
                  Sign Up Free
                </Link>
              </div>
              <button
                onClick={() => {
                  closeMobileMenu();
                  onOpenDemo();
                }}
                className={cn(primaryBtnClass, 'inline-flex w-full justify-center py-[0.65rem] text-[0.9rem]')}
              >
                <Camera size={16} strokeWidth={2.2} />
                <span>Try Scan Demo</span>
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
