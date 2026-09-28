import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  authKeys,
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  signupRequest,
  signupWithInviteRequest,
  type SessionUser,
} from './auth-api';
import { applySession, clearSession, useAuthStore } from './auth-store';
import { clearOfflineSession, saveOfflineUser } from './offline-session';
import { clearApiCache } from './pwa';

export function appReturnPath(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return '/app';
  const from = (state as { from: unknown }).from;
  if (typeof from !== 'string' || !from.startsWith('/app')) return '/app';
  return from;
}

const ACCESS_STALE_MS = 5 * 60 * 1000;
const REFRESH_AHEAD_MS = 12 * 60 * 1000;

function cacheSession(queryClient: QueryClient, user: SessionUser) {
  clearApiCache();
  void queryClient.cancelQueries({ queryKey: authKeys.me });
  queryClient.setQueryData(authKeys.me, user);
  applySession(user);
  saveOfflineUser(user);
}

export function useMeQuery() {
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: fetchCurrentUser,
    staleTime: ACCESS_STALE_MS,
    refetchInterval: REFRESH_AHEAD_MS,
    retry: false,
  });

  if (query.isSuccess) {
    const current = useAuthStore.getState().user;
    if (query.data !== current) {
      if (query.data) {
        applySession(query.data);
        saveOfflineUser(query.data);
      } else {
        clearSession();
        clearOfflineSession();
      }
    }
  }

  return query;
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => loginRequest(email, password),
    onSuccess: (user) => cacheSession(queryClient, user),
  });
}

export function useSignupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; name: string; companyName: string }) =>
      signupRequest(input),
    onSuccess: (user) => cacheSession(queryClient, user),
  });
}

export function useSignupWithInviteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; email: string; password: string; name: string }) =>
      signupWithInviteRequest(input),
    onSuccess: (user) => cacheSession(queryClient, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logoutRequest,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: authKeys.me });
      clearApiCache();
      clearSession();
      clearOfflineSession();
      queryClient.setQueryData(authKeys.me, null);
      navigate('/');
    },
    onSettled: () => {
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
