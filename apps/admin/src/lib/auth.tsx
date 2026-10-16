'use client';

import { ApiError, type MeResponse } from '@lunchbox/api-client';
import {
  getMultiFactorResolver,
  multiFactor,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { firebaseAuth } from './firebase';

export type Role = 'SUPER_ADMIN' | 'OPS_ADMIN' | 'SUPPORT' | 'SCHOOL_ADMIN';

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'mfaChallenge'; resolver: MultiFactorResolver; error?: string }
  | { kind: 'mfaEnroll'; user: User; error?: string }
  | { kind: 'ready'; me: MeResponse & { role: Role } };

interface AuthApi {
  state: State;
  signIn: (email: string, password: string) => Promise<void>;
  verifyTotp: (code: string) => Promise<void>;
  startEnrollment: () => Promise<{ secret: TotpSecret; qrUrl: string }>;
  finishEnrollment: (secret: TotpSecret, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthApi | null>(null);
const IDLE_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES ?? 30) * 60_000;

/**
 * Staff sign in with email + password and a TOTP second factor (Firebase Identity Platform). The backend refuses
 * tokens without a second factor and sessions older than 12 h; the UI additionally signs out after inactivity.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async (user: User | null) => {
    if (!user) {
      setState((s) => (s.kind === 'mfaChallenge' ? s : { kind: 'signedOut' }));
      return;
    }
    try {
      const me = await api.auth.me();
      if (!me.registered || !me.role || !['SUPER_ADMIN', 'OPS_ADMIN', 'SUPPORT', 'SCHOOL_ADMIN'].includes(me.role)) {
        await fbSignOut(firebaseAuth());
        setState({ kind: 'signedOut', error: 'This account does not have admin access.' });
        return;
      }
      setState({ kind: 'ready', me: me as MeResponse & { role: Role } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') {
        setState({ kind: 'mfaEnroll', user });
      } else {
        setState({ kind: 'signedOut', error: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  useEffect(() => onIdTokenChanged(firebaseAuth(), (u) => void load(u)), [load]);

  // Idle timeout.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    let timer = setTimeout(() => void fbSignOut(firebaseAuth()), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fbSignOut(firebaseAuth()), IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [state.kind]);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      signIn: async (email, password) => {
        try {
          await signInWithEmailAndPassword(firebaseAuth(), email, password);
        } catch (e) {
          const err = e as MultiFactorError;
          if (err.code === 'auth/multi-factor-auth-required') {
            setState({ kind: 'mfaChallenge', resolver: getMultiFactorResolver(firebaseAuth(), err) });
            return;
          }
          setState({ kind: 'signedOut', error: 'Incorrect email or password.' });
        }
      },
      verifyTotp: async (code) => {
        if (state.kind !== 'mfaChallenge') return;
        const hint = state.resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) {
          setState({ ...state, error: 'No authenticator app is enrolled for this account.' });
          return;
        }
        try {
          await state.resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
        } catch {
          setState({ ...state, error: 'That code is not valid. Try the latest code from your authenticator.' });
        }
      },
      startEnrollment: async () => {
        if (state.kind !== 'mfaEnroll') throw new Error('Not enrolling');
        const session = await multiFactor(state.user).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        return { secret, qrUrl: secret.generateQrCodeUrl(state.user.email ?? 'admin', 'LunchBox Admin') };
      },
      finishEnrollment: async (secret, code) => {
        if (state.kind !== 'mfaEnroll') return;
        await multiFactor(state.user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Authenticator');
        // Second factor must be part of the sign-in for the backend to accept the token: sign in again.
        await fbSignOut(firebaseAuth());
        setState({ kind: 'signedOut', error: 'Authenticator added. Please sign in again.' });
      },
      signOut: () => fbSignOut(firebaseAuth()),
      can: (...roles) => state.kind === 'ready' && roles.includes(state.me.role),
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
