import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Boxes,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileCode2,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Timer,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useLogout } from '../../lib/auth-session';
import { useRequiredUser } from '../../lib/auth-store';
import { DASHBOARD_SITES } from '../../lib/dashboard-data';

const PRIMARY_NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/invoices', label: 'Invoices', icon: ClipboardList, end: false },
  { to: '/app/inventory', label: 'Inventory', icon: Package, end: false },
  { to: '/app/expiry', label: 'Expiry', icon: Timer, end: false },
  { to: '/app/pos', label: 'Sales POS', icon: ShoppingCart, end: false },
];

const SYSTEM_NAV = [
  { to: '/app/audit', label: 'Audit XML', icon: FileCode2, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
];

const DOCK = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/invoices', label: 'Invoices', icon: ClipboardList, end: false },
  { to: 'scan', label: 'Scan', icon: Camera, end: false },
  { to: '/app/inventory', label: 'Stock', icon: Package, end: false },
  { to: '/app/expiry', label: 'Expiry', icon: Timer, end: false },
];

interface DashboardShellProps {
  siteId: string;
  onSiteChange: (id: string) => void;
  notifications: string[];
  onScan: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  siteId,
  onSiteChange,
  notifications,
  onScan,
}) => {
  const user = useRequiredUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [siteOpen, setSiteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const site = DASHBOARD_SITES.find((row) => row.id === siteId) ?? DASHBOARD_SITES[0];

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setSiteOpen(false);
        setBellOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const navClass = useMemo(
    () =>
      ({ isActive }: { isActive: boolean }) =>
        cn(
          'flex items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.84rem] font-medium transition-all duration-150 [&[aria-current=page]_span]:border-ops-accent/20 [&[aria-current=page]_span]:bg-indigo-50 [&[aria-current=page]_span]:text-ops-accent',
          isActive ? 'bg-indigo-50 text-ops-accent' : 'text-slate-500 hover:bg-slate-100 hover:text-ops-ink',
        ),
    [],
  );

  return (
    <div className="relative min-h-dvh bg-ops-canvas font-geist text-ops-ink antialiased selection:bg-ops-accent/20">
      <div className="pointer-events-none fixed top-[-8rem] left-1/4 -z-10 size-[36rem] rounded-full bg-ops-accent/[0.06] blur-[120px]" />
      <div className="pointer-events-none fixed right-0 bottom-0 -z-10 size-[28rem] rounded-full bg-ops-teal/[0.06] blur-[110px]" />

      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex h-full items-center gap-3 px-3.5 md:px-5" ref={menuRef}>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="group flex min-w-0 items-center gap-2.5 font-display text-[1.05rem] font-semibold tracking-tight text-ops-ink transition-opacity active:opacity-80"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.65rem] bg-ops-teal text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)]">
              <Boxes size={18} strokeWidth={2.2} />
            </span>
            <span className="hidden tracking-tight font-semibold sm:inline">Skladnik</span>
          </button>

          <div className="relative min-w-0 flex-1 md:flex-none">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSiteOpen((open) => !open);
                setBellOpen(false);
                setProfileOpen(false);
              }}
              className="flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-ops-canvas px-3 py-1.5 font-display text-[0.78rem] font-medium text-ops-ink shadow-sm transition-all hover:border-ops-accent/30 hover:bg-white active:scale-[0.98]"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-ops-teal" />
              <span className="truncate">{site.name}</span>
              <ChevronDown size={13} className="shrink-0 text-slate-400" />
            </button>

            {siteOpen && (
              <div className="absolute top-[calc(100%+0.5rem)] left-0 z-50 min-w-[17rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(30,27,75,0.14)]">
                <p className="px-3 py-1.5 font-display text-[0.7rem] font-medium tracking-wider text-slate-400 uppercase">Select Location</p>
                {DASHBOARD_SITES.map((option) => {
                  const active = option.id === siteId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onSiteChange(option.id);
                        setSiteOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-display text-[0.82rem] transition-all',
                        active ? 'bg-indigo-50 font-medium text-ops-accent' : 'text-ops-ink hover:bg-ops-canvas',
                      )}
                    >
                      <span>{option.name}</span>
                      {active && <CheckCircle2 size={14} className="text-ops-accent" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setBellOpen((open) => !open);
                  setSiteOpen(false);
                  setProfileOpen(false);
                }}
                className="relative flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-ops-accent/30 hover:text-ops-accent active:scale-95"
                aria-label="Notifications"
              >
                <Bell size={16} strokeWidth={2} />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 size-2 rounded-full bg-ops-danger ring-2 ring-white" />
                )}
              </button>

              {bellOpen && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-[19rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(30,27,75,0.14)]">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <p className="font-display text-[0.72rem] font-medium tracking-wider text-slate-500 uppercase">Actionable Notices</p>
                    <span className="rounded-full border border-slate-200 bg-ops-canvas px-2 py-0.5 font-mono text-[0.68rem] text-ops-ink">
                      {notifications.length}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {notifications.length === 0 ? (
                      <p className="px-3 py-3 text-center font-sans text-[0.78rem] text-slate-500">Everything is up to date.</p>
                    ) : (
                      notifications.map((note) => (
                        <div key={note} className="rounded-xl border border-slate-100 bg-ops-canvas px-3 py-2.5 font-sans text-[0.78rem] leading-relaxed text-ops-ink">
                          {note}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setProfileOpen((open) => !open);
                  setSiteOpen(false);
                  setBellOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-2.5 pl-1 shadow-sm transition-all hover:border-ops-accent/30 active:scale-[0.98]"
              >
                <span className="flex size-7 items-center justify-center rounded-full border border-ops-accent/20 bg-indigo-50 font-display text-[0.75rem] font-semibold text-ops-accent sm:size-7.5">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[8.5rem] truncate font-display text-[0.78rem] font-medium text-ops-ink sm:inline">{user.name}</span>
              </button>

              {profileOpen && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(30,27,75,0.14)]">
                  <div className="mb-1 border-b border-slate-100 px-3 py-2">
                    <p className="truncate font-display text-[0.82rem] font-medium text-ops-ink">{user.companyName}</p>
                    <p className="truncate font-sans text-[0.72rem] text-slate-500">{user.email}</p>
                    <p className="mt-0.5 font-display text-[0.68rem] font-medium tracking-wide text-ops-accent uppercase">{user.role.replaceAll('_', ' ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/app/pos');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-slate-600 transition-colors hover:bg-ops-canvas hover:text-ops-ink lg:hidden"
                  >
                    <ShoppingCart size={15} />
                    Sales POS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/app/audit');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-slate-600 transition-colors hover:bg-ops-canvas hover:text-ops-ink lg:hidden"
                  >
                    <FileCode2 size={15} />
                    Audit XML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/app/settings');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-slate-600 transition-colors hover:bg-ops-canvas hover:text-ops-ink"
                  >
                    <Settings size={15} />
                    Settings
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => logout.mutate()}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-ops-danger transition-colors hover:bg-rose-50"
                  >
                    <LogOut size={15} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed top-16 bottom-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200/80 bg-white px-3 py-5 lg:flex">
        <p className="px-3 pb-2 font-display text-[0.68rem] font-medium tracking-wider text-slate-400 uppercase">Workspace</p>
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span className="flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-ops-canvas text-current">
                <item.icon size={14} strokeWidth={2} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <p className="mt-6 px-3 pb-2 font-display text-[0.68rem] font-medium tracking-wider text-slate-400 uppercase">System</p>
        <nav className="flex flex-col gap-0.5">
          {SYSTEM_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span className="flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-ops-canvas text-current">
                <item.icon size={14} strokeWidth={2} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onScan}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-3 py-2.5 font-display text-[0.84rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] transition-all hover:bg-ops-teal-hover active:scale-[0.98]"
          >
            <Camera size={16} strokeWidth={2.2} />
            <span>Photograph invoice</span>
          </button>
        </div>
      </aside>

      <main className="min-h-dvh pt-16 pb-32 lg:pb-8 lg:pl-60">
        <div className="mx-auto max-w-[1220px] px-3.5 py-5 sm:px-6 sm:py-7">
          <Outlet />
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] lg:hidden">
        <nav className="pointer-events-auto relative mx-auto max-w-md rounded-[1.6rem] border border-slate-200/90 bg-white/90 px-2 py-1.5 shadow-[0_16px_40px_rgba(30,27,75,0.14)] backdrop-blur-xl">
          <div className="grid grid-cols-5 items-center">
            {DOCK.map((item) => {
              if (item.to === 'scan') {
                return (
                  <div key="scan" className="flex flex-col items-center justify-center">
                    <button
                      type="button"
                      onClick={onScan}
                      aria-label="Photograph invoice"
                      className="group -mt-5 flex flex-col items-center gap-1 transition-transform duration-150 active:scale-90 focus:outline-none"
                    >
                      <span className="relative flex size-12.5 items-center justify-center rounded-full bg-ops-ai p-[2.5px] shadow-[0_8px_22px_rgba(147,51,234,0.35)]">
                        <span className="flex size-full items-center justify-center rounded-full bg-ops-ai text-white">
                          <Camera size={19} strokeWidth={2.2} />
                        </span>
                      </span>
                      <span className="font-display text-[0.63rem] font-semibold tracking-tight text-ops-ai">Scan</span>
                    </button>
                  </div>
                );
              }
              const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 transition-all duration-150 select-none active:scale-90',
                    active ? 'text-ops-accent' : 'text-slate-400 hover:text-ops-ink',
                  )}
                >
                  <item.icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                  <span className={cn('font-display text-[0.63rem] leading-none tracking-tight', active ? 'font-semibold text-ops-accent' : 'font-medium text-slate-400')}>
                    {item.label}
                  </span>
                  {active ? <span className="size-1 rounded-full bg-ops-accent" /> : <span className="size-1 opacity-0" />}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
