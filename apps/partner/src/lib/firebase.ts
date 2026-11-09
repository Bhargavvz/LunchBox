import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';

// Local development only: send sign-in to the Firebase Auth emulator (host:port). Test phone numbers then get their
// code from the emulator UI instead of an SMS. Release builds never set this variable.
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR;
if (emulatorHost) {
  auth().useEmulator(`http://${emulatorHost}`);
  auth().settings.appVerificationDisabledForTesting = true;
}

export async function idToken(force = false): Promise<string | null> {
  const user = auth().currentUser;
  return user ? user.getIdToken(force) : null;
}

export function startPhoneSignIn(phoneE164: string): Promise<FirebaseAuthTypes.ConfirmationResult> {
  return auth().signInWithPhoneNumber(phoneE164);
}

export async function signOut(): Promise<void> {
  if (auth().currentUser) await auth().signOut();
}

export { auth };
