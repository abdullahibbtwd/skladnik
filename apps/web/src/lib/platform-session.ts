import { useQuery } from '@tanstack/react-query';
import { fetchPlatformMe, type PlatformSessionUser } from './platform-api';

export const platformAuthKeys = {
  me: ['platform-auth', 'me'] as const,
};

export function usePlatformMeQuery() {
  return useQuery({
    queryKey: platformAuthKeys.me,
    queryFn: fetchPlatformMe,
    staleTime: 30_000,
    retry: false,
  });
}

export type { PlatformSessionUser };
