import { ApiError } from '@lunchbox/api-client';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

// React Native has no window focus: refetch stale queries (today's orders, tracking) when the app comes back to the
// foreground, so a parent returning to the app never looks at a frozen screen.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => {
    if (Platform.OS !== 'web') handleFocus(state === 'active');
  });
  return () => sub.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => (error instanceof ApiError && !error.retryable ? false : failures < 3),
    },
    mutations: { retry: false },
  },
});

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
