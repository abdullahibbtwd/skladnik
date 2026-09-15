import { create } from 'zustand';
import type { UserRole } from '@skladnik/shared';
import type { SessionUser } from './auth-api';

type AuthState = {
  user: SessionUser | null;
  setSession: (user: SessionUser) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setSession: (user) => set({ user }),
  clearSession: () => set({ user: null }),
}));

export function applySession(user: SessionUser) {
  useAuthStore.getState().setSession(user);
}

export function clearSession() {
  useAuthStore.getState().clearSession();
}

export function useAuthUser() {
  return useAuthStore((state) => state.user);
}

export function useIsAuthenticated() {
  return useAuthStore((state) => state.user !== null);
}

export function useAuthRole(): UserRole | null {
  return useAuthStore((state) => state.user?.role ?? null);
}

export function useAuthCompany() {
  return useAuthStore((state) =>
    state.user
      ? {
          companyId: state.user.companyId,
          companyName: state.user.companyName,
          allSites: state.user.allSites,
          siteIds: state.user.siteIds,
        }
      : null,
  );
}

export function useRequiredUser(): SessionUser {
  const user = useAuthUser();
  if (!user) {
    throw new Error('Authenticated user is required');
  }
  return user;
}
