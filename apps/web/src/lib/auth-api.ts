import type { UserRole } from '@skladnik/shared';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  siteIds: string[];
  allSites: boolean;
};

type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  siteIds: string[];
  allSites: boolean;
};

export const authKeys = {
  all: ['auth'] as const,
  me: ['auth', 'me'] as const,
};

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('. ');
  }
  return fallback;
}

function mapUser(user: ApiUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    companyName: user.companyName,
    siteIds: user.siteIds ?? [],
    allSites: Boolean(user.allSites),
  };
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorMessage(payload, 'Something went wrong. Please try again.'));
  }
  return payload as T;
}

async function requestMe(): Promise<SessionUser | 'unauthorized'> {
  const response = await fetch('/auth/me', { credentials: 'include' });
  if (response.status === 401) return 'unauthorized';
  if (!response.ok) {
    throw new Error('Could not verify the current session.');
  }
  const payload = (await response.json()) as { user?: ApiUser };
  if (!payload.user) return 'unauthorized';
  return mapUser(payload.user);
}

export async function refreshSession(): Promise<boolean> {
  const response = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
  return response.ok;
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const first = await requestMe();
  if (first !== 'unauthorized') return first;

  const refreshed = await refreshSession();
  if (!refreshed) return null;

  const retry = await requestMe();
  return retry === 'unauthorized' ? null : retry;
}

export async function loginRequest(email: string, password: string): Promise<SessionUser> {
  const data = await postJson<{ user: ApiUser }>('/auth/login', { email, password });
  return mapUser(data.user);
}

export async function signupRequest(input: {
  email: string;
  password: string;
  name: string;
  companyName: string;
}): Promise<SessionUser> {
  const data = await postJson<{ user: ApiUser }>('/auth/signup', input);
  return mapUser(data.user);
}

export async function logoutRequest(): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include', signal: controller.signal });
  } catch {
    // Local session is cleared regardless — the cookie may already be gone.
  } finally {
    window.clearTimeout(timer);
  }
}
