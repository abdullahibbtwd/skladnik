import { useEffect } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  authKeys,
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  signupRequest,
  type SessionUser,
} from './auth-api';
import { applySession, clearSession } from './auth-store';

const ACCESS_STALE_MS = 5 * 60 * 1000;
const REFRESH_AHEAD_MS = 12 * 60 * 1000;

function cacheSession(queryClient: QueryClient, user: SessionUser) {
  void queryClient.cancelQueries({ queryKey: authKeys.me });
  queryClient.setQueryData(authKeys.me, user);
  applySession(user);
}

export function useMeQuery() {
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: fetchCurrentUser,
    staleTime: ACCESS_STALE_MS,
    refetchInterval: REFRESH_AHEAD_MS,
    retry: false,
  });

  useEffect(() => {
    if (query.isPending) return;
    if (query.data) {
      applySession(query.data);
      return;
    }
    if (query.isSuccess) {
      clearSession();
    }
  }, [query.data, query.isPending, query.isSuccess]);

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

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logoutRequest,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: authKeys.me });
      clearSession();
      queryClient.setQueryData(authKeys.me, null);
      navigate('/');
    },
    onSettled: () => {
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
