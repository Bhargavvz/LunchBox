import { ApiError, type MeResponse } from '@lunchbox/api-client';
import { create } from 'zustand';
import { api } from './api';
import { auth, idToken } from './firebase';

export type SessionStatus = 'loading' | 'signedOut' | 'notApproved' | 'ready';

interface SessionState {
  status: SessionStatus;
  me: MeResponse | null;
  message: string | null;
  refresh: () => Promise<void>;
}

/**
 * Only KYC-approved partners can sign in: the backend links the phone number to a pre-provisioned partner account
 * on first sign-in and refuses (403) partners who are not approved or are deactivated.
 */
export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  me: null,
  message: null,
  refresh: async () => {
    if (!auth().currentUser) {
      set({ status: 'signedOut', me: null });
      return;
    }
    try {
      const me = await api.auth.me();
      if (!me.registered || me.role !== 'PARTNER') {
        set({
          status: 'notApproved',
          me,
          message: 'This number is not registered as a LunchBox delivery partner. Contact LunchBox operations to onboard.',
        });
        return;
      }
      // Claims were just set on first link; refresh so the role is in the token for STOMP.
      await idToken(true);
      set({ status: 'ready', me, message: null });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not reach LunchBox. Check your connection.';
      set({ status: e instanceof ApiError && e.status === 403 ? 'notApproved' : 'signedOut', message });
    }
  },
}));

export function bindAuthState(): () => void {
  return auth().onAuthStateChanged((user) => {
    if (!user) useSession.setState({ status: 'signedOut', me: null });
    else void useSession.getState().refresh();
  });
}
