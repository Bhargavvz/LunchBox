import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';

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
