import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useInstallStore } from '../lib/pwa';

const VIEWS_KEY = 'skladnik.pwa.pageViews';
const SNOOZED_KEY = 'skladnik.pwa.installSnoozedAt';
const MIN_PAGE_VIEWS = 2;
const MIN_ENGAGED_SECONDS = 30;
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function readNumber(key: string) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const event = useInstallStore((state) => state.event);
  const [pageViews, setPageViews] = useState(() => readNumber(VIEWS_KEY));
  const [engaged, setEngaged] = useState(false);
  const [snoozed, setSnoozed] = useState(() => Date.now() - readNumber(SNOOZED_KEY) < SNOOZE_MS);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setPageViews((count) => {
      writeNumber(VIEWS_KEY, count + 1);
      return count + 1;
    });
  }, [pathname]);

  useEffect(() => {
    if (engaged) return;
    let seconds = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seconds += 1;
      if (seconds >= MIN_ENGAGED_SECONDS) setEngaged(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [engaged]);

  if (pathname.startsWith('/platform')) return null;
  if (!event || snoozed || (pageViews < MIN_PAGE_VIEWS && !engaged)) return null;

  const snooze = () => {
    writeNumber(SNOOZED_KEY, Date.now());
    setSnoozed(true);
  };

  const install = async () => {
    await event.prompt();
    const { outcome } = await event.userChoice;
    useInstallStore.setState({ event: null });
    if (outcome === 'dismissed') snooze();
  };

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      data-testid="install-prompt"
      className="fixed inset-x-3 bottom-[6.5rem] z-[150] print:hidden md:inset-x-auto md:bottom-5 md:left-5 md:w-[22.5rem]"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-[0_18px_40px_-18px_rgba(30,27,75,0.35)] backdrop-blur-xl">
        <img src="/pwa-192x192.png" alt="" className="size-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="install-prompt-title" className="font-display text-[0.9rem] font-semibold text-ops-ink">
            {t('pwa.install.title')}
          </p>
          <p className="mt-0.5 font-sans text-[0.78rem] leading-snug text-slate-500">{t('pwa.install.body')}</p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-lg bg-ops-teal px-3 py-1.5 font-display text-[0.8rem] font-semibold text-white transition-colors hover:bg-teal-700"
            >
              {t('pwa.install.action')}
            </button>
            <button
              type="button"
              onClick={snooze}
              className="rounded-lg px-3 py-1.5 font-display text-[0.8rem] font-semibold text-slate-500 transition-colors hover:bg-ops-canvas hover:text-ops-ink"
            >
              {t('pwa.install.later')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={snooze}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-ops-canvas hover:text-ops-ink"
          aria-label={t('common.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
