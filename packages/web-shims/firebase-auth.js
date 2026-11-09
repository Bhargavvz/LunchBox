// Web stand-in for @react-native-firebase/auth, backed by the Firebase JS SDK. Covers the calls the apps make.
import { getApps, initializeApp } from 'firebase/app';
import {
  RecaptchaVerifier,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
} from 'firebase/auth';

let instance = null;

function recaptchaContainer() {
  let el = document.getElementById('recaptcha-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'recaptcha-container';
    document.body.appendChild(el);
  }
  return el;
}

export default function auth() {
  if (instance) return instance;
  const app = getApps()[0] ?? initializeApp({ apiKey: 'demo-key', projectId: 'demo-lunchbox', authDomain: 'demo-lunchbox.firebaseapp.com' });
  const webAuth = getAuth(app);
  const emulator = process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR;
  if (emulator) {
    connectAuthEmulator(webAuth, `http://${emulator}`, { disableWarnings: true });
    webAuth.settings.appVerificationDisabledForTesting = true;
  }
  instance = {
    get currentUser() {
      return webAuth.currentUser;
    },
    settings: webAuth.settings,
    // The emulator is connected above; the native call is a no-op here.
    useEmulator() {},
    onAuthStateChanged: (listener) => onAuthStateChanged(webAuth, listener),
    signOut: () => signOut(webAuth),
    signInWithPhoneNumber: (phone) =>
      signInWithPhoneNumber(webAuth, phone, new RecaptchaVerifier(webAuth, recaptchaContainer(), { size: 'invisible' })),
  };
  return instance;
}
