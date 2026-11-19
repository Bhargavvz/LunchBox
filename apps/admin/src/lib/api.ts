import { ApiError, createLunchBoxApi, createRealtime } from '@lunchbox/api-client';
import { QueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';

/**
 * Waits for Firebase to restore a saved session first: after a page reload, queries start before the signed-in user is
 * loaded from storage, and sending them without a token made every page open with "Please sign in to continue".
 */
async function token(): Promise<string | null> {
  const auth = firebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
}

const SIGN_OUT_REASON = 'lunchbox.admin.signOutReason';

/** The reason the last automatic sign-out happened, shown once on the login page. */
export function takeSignOutReason(): string | undefined {
  try {
    const reason = sessionStorage.getItem(SIGN_OUT_REASON) ?? undefined;
    sessionStorage.removeItem(SIGN_OUT_REASON);
    return reason;
  } catch {
    return undefined;
  }
}

let checking: Promise<void> | null = null;

/**
 * A 401 only ends the session when the server still refuses a freshly refreshed token. Requests sent before sign-in
 * finished (no token) and stale responses that arrive after the authenticator step are ignored; signing out on those
 * sent admins straight back to the login page after a successful sign-in.
 */
function handleUnauthorized({ hadToken, message }: { hadToken: boolean; message?: string }) {
  const user = firebaseAuth().currentUser;
  if (!hadToken || !user || checking) return;
  checking = (async () => {
    try {
      const fresh = await user.getIdToken(true);
      const check = await fetch(`${apiUrl}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${fresh}` } });
      if (check.status === 401) {
        try {
          sessionStorage.setItem(SIGN_OUT_REASON, message ?? 'Your session has ended. Please sign in again.');
        } catch {
          // Storage unavailable (private mode): the generic login page is shown.
        }
        await signOut(firebaseAuth());
      }
    } catch {
      // Network trouble is not a reason to end the session.
    } finally {
      checking = null;
    }
  })();
}

export const api = createLunchBoxApi({
  baseUrl: apiUrl,
  getToken: token,
  getLanguage: () => 'en',
  onUnauthorized: handleUnauthorized,
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
