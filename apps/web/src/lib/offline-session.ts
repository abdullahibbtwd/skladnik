import type { SessionUser } from './auth-api';
import type { SiteRecord } from './workspace-api';

/**
 * The last verified user and their active sites, so the app can open and queue photos while the
 * API is unreachable. Used only when the session can't be checked; cleared on logout.
 */
export type OfflineSite = Pick<SiteRecord, 'id' | 'name' | 'type'>;

type OfflineSession = { user: SessionUser; sites: OfflineSite[] };

const storageKey = 'skladnik.offline.session';

export function readOfflineSession(): OfflineSession | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineSession>;
    if (!parsed.user?.id || !parsed.user.companyId) return null;
    return { user: parsed.user, sites: Array.isArray(parsed.sites) ? parsed.sites : [] };
  } catch {
    return null;
  }
}

function write(session: OfflineSession) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function saveOfflineUser(user: SessionUser) {
  const current = readOfflineSession();
  write({ user, sites: current?.user.id === user.id ? current.sites : [] });
}

export function saveOfflineSites(userId: string, sites: OfflineSite[]) {
  const current = readOfflineSession();
  if (current?.user.id !== userId) return;
  write({ user: current.user, sites: sites.map(({ id, name, type }) => ({ id, name, type })) });
}

export function readOfflineSites(user: { id: string } | null | undefined): OfflineSite[] {
  const current = readOfflineSession();
  return user && current?.user.id === user.id ? current.sites : [];
}

export function clearOfflineSession() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
