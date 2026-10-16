import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

let authInstance: Auth | null = null;

/** Lazily initialised so the static export can be pre-rendered without browser APIs. */
export function firebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-key',
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-lunchbox',
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  authInstance = getAuth(app);
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR;
  if (emulator) {
    connectAuthEmulator(authInstance, `http://${emulator}`, { disableWarnings: true });
  }
  return authInstance;
}
