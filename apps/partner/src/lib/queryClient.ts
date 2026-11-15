import { ApiError } from '@lunchbox/api-client';
import { QueryClient } from '@tanstack/react-query';
import i18n from '../i18n';

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
  // Checked by name so this module does not load the background location task.
  if (e instanceof Error && e.name === 'LocationPermissionError') return i18n.t('route.locationNeeded');
  return e instanceof Error ? e.message : 'Something went wrong.';
}
