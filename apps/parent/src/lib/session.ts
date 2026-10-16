import type { MeResponse } from '@lunchbox/api-client';
import { create } from 'zustand';
import i18n from '../i18n';
import { api } from './api';
import { auth, idToken } from './firebase';

export type SessionStatus = 'loading' | 'signedOut' | 'needsRegistration' | 'needsConsent' | 'ready';

interface SessionState {
  status: SessionStatus;
  me: MeResponse | null;
  error: string | null;
  refresh: (forceToken?: boolean) => Promise<void>;
  reset: () => void;
}

function hasConsent(me: MeResponse, purpose: string): boolean {
  const latest = me.consents.find((c) => c.purpose === purpose);
  return !!latest && latest.granted && !latest.withdrawnAt;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  me: null,
  error: null,
  refresh: async (forceToken = false) => {
    if (!auth().currentUser) {
      set({ status: 'signedOut', me: null });
      return;
    }
    try {
      if (forceToken) {
        await idToken(true);
      }
      const me = await api.auth.me();
      if (!me.registered) {
        set({ status: 'needsRegistration', me, error: null });
        return;
      }
      if (me.role !== 'PARENT') {
        set({ status: 'signedOut', me: null, error: 'This app is for parents. Partners use the LunchBox Partner app.' });
        await auth().signOut();
        return;
      }
      if (me.preferredLanguage && me.preferredLanguage !== i18n.language) {
        await i18n.changeLanguage(me.preferredLanguage);
      }
      set({ status: hasConsent(me, 'CHILD_DATA_PROCESSING') ? 'ready' : 'needsConsent', me, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  reset: () => set({ status: 'signedOut', me: null, error: null }),
}));

/** Wires Firebase auth state into the session store. Returns the unsubscribe function. */
export function bindAuthState(): () => void {
  return auth().onAuthStateChanged((user) => {
    if (!user) {
      useSession.getState().reset();
    } else {
      void useSession.getState().refresh();
    }
  });
}
