import { ApiError } from '@lunchbox/api-client';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      networkMode: 'offlineFirst',
      retry: (failures, error) => (error instanceof ApiError && !error.retryable ? false : failures < 3),
    },
  },
});

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
