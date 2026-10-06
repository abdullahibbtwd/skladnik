import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChefHat,
  Boxes,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileCode2,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  LogOut,
  Package,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Tags,
  Timer,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Notice } from '../../lib/dashboard-data';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../lib/auth-session';
import { useRequiredUser } from '../../lib/auth-store';
import { useConnectivity } from '../../lib/connectivity';
import { permissionsFor, type Permission } from '../../lib/permissions';
import { usePhotoQueueCounts } from '../../lib/photo-queue-runtime';
import { useSiteChoices } from '../../lib/workspace-session';
import { LanguageSwitch } from '../LanguageSwitch';
import { confirm } from '../ui/Dialog';
import { PhotoQueueBadge } from './PhotoQueueBadge';
import { SubscriptionExpiryBanner } from './SubscriptionExpiryBanner';

type NavItem = { to: string; labelKey: string; icon: LucideIcon; end?: boolean; requires?: Permission };

const PRIMARY_NAV: NavItem[] = [
  { to: '/app', labelKey: 'app.overview', icon: LayoutDashboard, end: true },
  { to: '/app/invoices', labelKey: 'app.documents', icon: ClipboardList },
  { to: '/app/stock', labelKey: 'app.stock', icon: Package },
  { to: '/app/transfer', labelKey: 'app.transfer', icon: ArrowLeftRight, requires: 'stockOps' },
  { to: '/app/stocktake', labelKey: 'app.stocktake', icon: ClipboardCheck, requires: 'stockOps' },
  { to: '/app/reorder', labelKey: 'app.reorder', icon: ShoppingBasket, requires: 'reorder' },
  { to: '/app/inventory', labelKey: 'app.inventory', icon: Tags },
  { to: '/app/expiry', labelKey: 'app.expiry', icon: Timer },
  { to: '/app/pos', labelKey: 'app.pos', icon: ShoppingCart, requires: 'pos' },
  { to: '/app/sales', labelKey: 'app.sales', icon: BarChart3, requires: 'salesRead' },
  { to: '/app/recipes', labelKey: 'app.recipes', icon: ChefHat, requires: 'manage' },
  { to: '/app/reports', labelKey: 'app.reports', icon: FileSpreadsheet, requires: 'reports' },
  { to: '/app/vat', labelKey: 'app.vat', icon: Landmark, requires: 'vat' },
];

const SYSTEM_NAV: NavItem[] = [
  { to: '/app/audit', labelKey: 'app.audit', icon: FileCode2, requires: 'audit' },
  { to: '/app/settings', labelKey: 'app.settings', icon: Settings },
];

/** Mobile menu entries for screens that have no dock slot. */
const MOBILE_MENU: NavItem[] = [
  { to: '/app', labelKey: 'app.overview', icon: LayoutDashboard },
  { to: '/app/invoices', labelKey: 'app.documents', icon: ClipboardList },
  { to: '/app/transfer', labelKey: 'app.transfer', icon: ArrowLeftRight, requires: 'stockOps' },
  { to: '/app/stocktake', labelKey: 'app.stocktake', icon: ClipboardCheck, requires: 'stockOps' },
  { to: '/app/reorder', labelKey: 'app.reorder', icon: ShoppingBasket, requires: 'reorder' },
  { to: '/app/opening-stock', labelKey: 'app.openingStock', icon: PackageOpen, requires: 'openingStock' },
  { to: '/app/inventory', labelKey: 'app.inventory', icon: Tags },
  { to: '/app/pos', labelKey: 'app.pos', icon: ShoppingCart, requires: 'pos' },
  { to: '/app/sales', labelKey: 'app.sales', icon: BarChart3, requires: 'salesRead' },
  { to: '/app/recipes', labelKey: 'app.recipes', icon: ChefHat, requires: 'manage' },
  { to: '/app/reports', labelKey: 'app.reports', icon: FileSpreadsheet, requires: 'reports' },
  { to: '/app/vat', labelKey: 'app.vat', icon: Landmark, requires: 'vat' },
  { to: '/app/audit', labelKey: 'app.audit', icon: FileCode2, requires: 'audit' },
];

type StartableDocument = 'RECEIPT' | 'WRITE_OFF';

type DockItem =
  | { kind: 'link'; to: string; labelKey: string; icon: LucideIcon }
  | { kind: 'start'; type: StartableDocument; labelKey: string; icon: LucideIcon }
  | { kind: 'center'; action: 'scan' | 'till' };

const DOCK: DockItem[] = [
  { kind: 'link', to: '/app/stock', labelKey: 'app.stock', icon: Package },
  { kind: 'start', type: 'RECEIPT', labelKey: 'app.receive', icon: PackagePlus },
  { kind: 'center', action: 'scan' },
  { kind: 'start', type: 'WRITE_OFF', labelKey: 'app.writeOff', icon: PackageMinus },
  { kind: 'link', to: '/app/expiry', labelKey: 'app.expiring', icon: Timer },
];

/** Spec §5 Staff dock: check stock / receive / scan / write-off / expiry — no till (SKL-16). */
const STAFF_DOCK: DockItem[] = [
  { kind: 'link', to: '/app/stock', labelKey: 'app.checkStock', icon: Package },
  { kind: 'start', type: 'RECEIPT', labelKey: 'app.receive', icon: PackagePlus },
  { kind: 'center', action: 'scan' },
  { kind: 'start', type: 'WRITE_OFF', labelKey: 'app.writeOff', icon: PackageMinus },
  { kind: 'link', to: '/app/expiry', labelKey: 'app.expiring', icon: Timer },
];

/** Cashier dock: stock / expiry / till focus (no document create). */
const CASHIER_DOCK: DockItem[] = [
  { kind: 'link', to: '/app/stock', labelKey: 'app.stock', icon: Package },
  { kind: 'link', to: '/app/expiry', labelKey: 'app.expiring', icon: Timer },
  { kind: 'center', action: 'till' },
  { kind: 'link', to: '/app/sales', labelKey: 'app.sales', icon: BarChart3 },
  { kind: 'link', to: '/app', labelKey: 'app.overview', icon: LayoutDashboard },
];

/** ACC-01: Accountant dock — reporting focus, no write actions. */
const ACCOUNTANT_DOCK: DockItem[] = [
  { kind: 'link', to: '/app/reports', labelKey: 'app.reports', icon: FileSpreadsheet },
  { kind: 'link', to: '/app/vat', labelKey: 'app.vat', icon: Landmark },
  { kind: 'link', to: '/app/audit', labelKey: 'app.audit', icon: FileCode2 },
  { kind: 'link', to: '/app/invoices', labelKey: 'app.documents', icon: ClipboardList },
  { kind: 'link', to: '/app', labelKey: 'app.overview', icon: LayoutDashboard },
];

interface DashboardShellProps {
  siteId: string;
  onSiteChange: (id: string) => void;
  notifications: Notice[];
  onScan: () => void;
  onStartDocument: (type: StartableDocument) => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  siteId,
  onSiteChange,
  notifications,
  onScan,
  onStartDocument,
}) => {
  const user = useRequiredUser();
  const permissions = permissionsFor(user.role);
  const allowed = (item: NavItem) => !item.requires || permissions[item.requires];
  const dock =
    user.role === 'ACCOUNTANT'
      ? ACCOUNTANT_DOCK
      : user.role === 'CASHIER'
        ? CASHIER_DOCK
        : user.role === 'STAFF'
          ? STAFF_DOCK
          : DOCK;
  const dockPaths = new Set(dock.flatMap((item) => (item.kind === 'link' ? [item.to] : item.kind === 'center' && item.action === 'till' ? ['/app/pos'] : [])));
  const mobileMenu = MOBILE_MENU.filter((item) => allowed(item) && !dockPaths.has(item.to));
  const { t } = useTranslation();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const { sites, isPending: sitesPending } = useSiteChoices();
  const queueCounts = usePhotoQueueCounts();
  const reachable = useConnectivity((state) => state.reachable);
  const [siteOpen, setSiteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const site = sites.find((row) => row.id === siteId) ?? sites[0];

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

      <header className="fixed inset-x-0 top-0 z-40 h-16 print:hidden border-b border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl">
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
              <span className="truncate">{site?.name ?? (sitesPending ? t('app.loadingSites') : t('app.noSites'))}</span>
              <ChevronDown size={13} className="shrink-0 text-slate-400" />
            </button>

            {siteOpen && (
              <div className="absolute top-[calc(100%+0.5rem)] left-0 z-50 min-w-[17rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(30,27,75,0.14)]">
                <p className="px-3 py-1.5 font-display text-[0.7rem] font-medium tracking-wider text-slate-400 uppercase">{t('app.selectLocation')}</p>
                {sites.map((option) => {
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
                      <span>
                        {option.name}
                        <span className="ml-2 font-sans text-[0.68rem] font-normal text-slate-400">
                          {t(`labels.siteType.${option.type}`)}
                        </span>
                      </span>
                      {active && <CheckCircle2 size={14} className="text-ops-accent" />}
                    </button>
                  );
                })}
                {sites.length === 0 && (
                  <p className="px-3 py-2 font-sans text-[0.78rem] text-slate-400">{t('app.noSites')}</p>
                )}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {permissions.createDocuments && <PhotoQueueBadge />}
            <LanguageSwitch compact />
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
                aria-label={t('app.notifications')}
              >
                <Bell size={16} strokeWidth={2} />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 size-2 rounded-full bg-ops-danger ring-2 ring-white" />
                )}
              </button>

              {bellOpen && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-[19rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(30,27,75,0.14)]">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <p className="font-display text-[0.72rem] font-medium tracking-wider text-slate-500 uppercase">{t('app.actionableNotices')}</p>
                    <span className="rounded-full border border-slate-200 bg-ops-canvas px-2 py-0.5 font-mono text-[0.68rem] text-ops-ink">
                      {notifications.length}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {notifications.length === 0 ? (
                      <p className="px-3 py-3 text-center font-sans text-[0.78rem] text-slate-500">{t('app.allUpToDate')}</p>
                    ) : (
                      notifications.map((note) => (
                        <button
                          key={note.text}
                          type="button"
                          disabled={!note.to}
                          onClick={() => {
                            if (!note.to) return;
                            setBellOpen(false);
                            navigate(note.to);
                          }}
                          className="rounded-xl border border-slate-100 bg-ops-canvas px-3 py-2.5 text-left font-sans text-[0.78rem] leading-relaxed text-ops-ink enabled:hover:border-ops-accent/30 enabled:hover:bg-indigo-50"
                        >
                          {note.text}
                        </button>
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
                    <p className="mt-0.5 font-display text-[0.68rem] font-medium tracking-wide text-ops-accent uppercase">{t(`labels.role.${user.role}`)}</p>
                  </div>
                  {mobileMenu.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate(item.to);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-slate-600 transition-colors hover:bg-ops-canvas hover:text-ops-ink md:hidden"
                    >
                      <item.icon size={15} />
                      {t(item.labelKey)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/app/settings');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-slate-600 transition-colors hover:bg-ops-canvas hover:text-ops-ink"
                  >
                    <Settings size={15} />
                    {t('app.settingsLink')}
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={async () => {
                      setProfileOpen(false);
                      if (queueCounts.total > 0) {
                        const ok = await confirm({
                          title: t('photoQueue.logoutTitle', { count: queueCounts.total }),
                          description: t('photoQueue.logoutBody'),
                          confirmLabel: t('app.logout'),
                        });
                        if (!ok) return;
                      }
                      logout.mutate();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 font-display text-[0.82rem] text-ops-danger transition-colors hover:bg-rose-50"
                  >
                    <LogOut size={15} />
                    {t('app.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed top-16 bottom-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200/80 bg-white px-3 py-5 md:flex print:hidden">
        <p className="px-3 pb-2 font-display text-[0.68rem] font-medium tracking-wider text-slate-400 uppercase">{t('app.workspace')}</p>
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.filter(allowed).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span className="flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-ops-canvas text-current">
                <item.icon size={14} strokeWidth={2} />
              </span>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <p className="mt-6 px-3 pb-2 font-display text-[0.68rem] font-medium tracking-wider text-slate-400 uppercase">{t('app.system')}</p>
        <nav className="flex flex-col gap-0.5">
          {SYSTEM_NAV.filter(allowed).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span className="flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-ops-canvas text-current">
                <item.icon size={14} strokeWidth={2} />
              </span>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        {permissions.createDocuments && (
          <div className="mt-auto border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onScan}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-3 py-2.5 font-display text-[0.84rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] transition-all hover:bg-ops-teal-hover active:scale-[0.98]"
            >
              <Camera size={16} strokeWidth={2.2} />
              <span>{t('app.photographInvoice')}</span>
            </button>
          </div>
        )}
      </aside>

      <main className="min-h-dvh pt-16 pb-32 md:pb-8 md:pl-60 print:p-0">
        <div className="mx-auto max-w-[1220px] px-3.5 py-5 sm:px-6 sm:py-7">
          {!reachable && (
            <div
              className="mb-4 flex items-start gap-2.5 rounded-2xl border border-ops-warn/25 bg-orange-50 px-4 py-3 font-sans text-[0.8rem] text-ops-warn print:hidden"
              data-testid="offline-banner"
            >
              <WifiOff size={16} className="mt-0.5 shrink-0" />
              <p>{t('app.offlineBanner')}</p>
            </div>
          )}
          <SubscriptionExpiryBanner />
          <Outlet />
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] md:hidden print:hidden">
        <nav className="pointer-events-auto relative mx-auto max-w-md rounded-[1.6rem] border border-slate-200/90 bg-white/90 px-2 py-1.5 shadow-[0_16px_40px_rgba(30,27,75,0.14)] backdrop-blur-xl">
          <div className="grid grid-cols-5 items-center">
            {dock.map((item) => {
              if (item.kind === 'center') {
                const scan = item.action === 'scan';
                const CenterIcon = scan ? Camera : ShoppingCart;
                return (
                  <div key={item.action} className="flex flex-col items-center justify-center">
                    <button
                      type="button"
                      onClick={scan ? onScan : () => navigate('/app/pos')}
                      aria-label={scan ? t('app.photographInvoice') : t('app.pos')}
                      className="group -mt-5 flex flex-col items-center gap-1 transition-transform duration-150 active:scale-90 focus:outline-none"
                    >
                      <span className="relative flex size-12.5 items-center justify-center rounded-full bg-ops-ai p-[2.5px] shadow-[0_8px_22px_rgba(147,51,234,0.35)]">
                        <span className="flex size-full items-center justify-center rounded-full bg-ops-ai text-white">
                          <CenterIcon size={19} strokeWidth={2.2} />
                        </span>
                      </span>
                      <span className="font-display text-[0.63rem] font-semibold tracking-tight text-ops-ai">{scan ? t('app.scan') : t('app.pos')}</span>
                    </button>
                  </div>
                );
              }
              const active =
                item.kind === 'link'
                  ? location.pathname.startsWith(item.to)
                  : location.pathname === '/app/invoices/new' &&
                    new URLSearchParams(location.search).get('type') === item.type;
              const className = cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 transition-all duration-150 select-none active:scale-90',
                active ? 'text-ops-accent' : 'text-slate-400 hover:text-ops-ink',
              );
              const content = (
                <>
                  <item.icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                  <span className={cn('font-display text-[0.63rem] leading-none tracking-tight', active ? 'font-semibold text-ops-accent' : 'font-medium text-slate-400')}>
                    {t(item.labelKey)}
                  </span>
                  {active ? <span className="size-1 rounded-full bg-ops-accent" /> : <span className="size-1 opacity-0" />}
                </>
              );
              return item.kind === 'link' ? (
                <NavLink key={item.to} to={item.to} className={className}>
                  {content}
                </NavLink>
              ) : (
                <button key={item.type} type="button" onClick={() => onStartDocument(item.type)} className={className}>
                  {content}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
