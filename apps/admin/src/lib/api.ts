import { ApiError, createLunchBoxApi, createRealtime } from '@lunchbox/api-client';
import { QueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';

async function token(): Promise<string | null> {
  const user = firebaseAuth().currentUser;
  return user ? user.getIdToken() : null;
}

export const api = createLunchBoxApi({
  baseUrl: apiUrl,
  getToken: token,
  getLanguage: () => 'en',
  onUnauthorized: () => void signOut(firebaseAuth()),
});

export const realtime = createRealtime({ url: wsUrl, getToken: token });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (n, e) => (e instanceof ApiError && !e.retryable ? false : n < 2),
    },
  },
});

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = e.fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ');
    return fields ? `${e.message} (${fields})` : e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
