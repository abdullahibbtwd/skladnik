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

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly email: string | null;

  constructor(status: number, message: string, code?: string | null, email?: string | null) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code ?? null;
    this.email = email ?? null;
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('. ');
  }
  return fallback;
}

function throwAuthError(response: Response, payload: unknown, fallback: string): never {
  const code =
    payload && typeof payload === 'object' && 'code' in payload && typeof (payload as { code: unknown }).code === 'string'
      ? (payload as { code: string }).code
      : null;
  const email =
    payload && typeof payload === 'object' && 'email' in payload && typeof (payload as { email: unknown }).email === 'string'
      ? (payload as { email: string }).email
      : null;
  throw new AuthApiError(response.status, errorMessage(payload, fallback), code, email);
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
    throwAuthError(response, payload, 'Something went wrong. Please try again.');
  }
  return payload as T;
}

export type SignupResult =
  | { status: 'EMAIL_VERIFICATION_REQUIRED'; email: string; delivered?: boolean; devCode?: string }
  | { status: 'OK'; user: SessionUser };

export type VerifyEmailResult = { user: SessionUser };

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

let refreshing: Promise<boolean> | null = null;

/** Refresh tokens are single-use, so concurrent callers must share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(
      (response) => response.ok,
      () => false,
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
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
}): Promise<SignupResult> {
  const data = await postJson<
    | { status: 'EMAIL_VERIFICATION_REQUIRED'; email: string; delivered?: boolean; devCode?: string }
    | { user: ApiUser }
  >('/auth/signup', input);
  if (data && typeof data === 'object' && 'status' in data && data.status === 'EMAIL_VERIFICATION_REQUIRED') {
    return {
      status: 'EMAIL_VERIFICATION_REQUIRED',
      email: data.email,
      delivered: data.delivered,
      devCode: data.devCode,
    };
  }
  if (data && typeof data === 'object' && 'user' in data && data.user) {
    return { status: 'OK', user: mapUser(data.user) };
  }
  throw new Error('Unexpected signup response');
}

export async function verifyEmailRequest(email: string, code: string): Promise<SessionUser> {
  const data = await postJson<{ user: ApiUser }>('/auth/verify-email', { email, code });
  return mapUser(data.user);
}

export async function resendVerificationRequest(email: string): Promise<{
  ok: true;
  email: string;
  delivered?: boolean;
  devCode?: string;
}> {
  return postJson('/auth/resend-verification', { email });
}

export async function signupWithInviteRequest(input: {
  token: string;
  email: string;
  password: string;
  name: string;
}): Promise<SessionUser> {
  const data = await postJson<{ user: ApiUser }>('/auth/signup-with-invite', input);
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

export type AuthProviders = {
  googleClientId: string | null;
};

export async function fetchAuthProviders(): Promise<AuthProviders> {
  const response = await fetch('/auth/providers', { credentials: 'include' });
  if (!response.ok) return { googleClientId: null };
  const payload = (await response.json()) as { googleClientId?: string | null };
  return { googleClientId: payload.googleClientId?.trim() || null };
}

export async function googleAuthRequest(credential: string): Promise<SessionUser> {
  const data = await postJson<{ user: ApiUser }>('/auth/google', { credential });
  return mapUser(data.user);
}

export async function forgotPasswordRequest(email: string): Promise<{
  ok: true;
  delivered?: boolean;
  resetUrl?: string;
}> {
  return postJson('/auth/forgot-password', { email });
}

export async function resetPasswordRequest(token: string, password: string): Promise<{ ok: true }> {
  return postJson('/auth/reset-password', { token, password });
}

export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string,
): Promise<SessionUser> {
  const data = await postJson<{ user: ApiUser }>('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return mapUser(data.user);
}
