import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      // Run the request even when the browser reports no network, so the service worker can answer
      // from its offline copy; only the retries wait for the connection.
      networkMode: 'offlineFirst',
    },
  },
});
