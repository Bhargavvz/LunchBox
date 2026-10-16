import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';

/** Current Firebase ID token (auto-refreshed by the SDK); `force` after registration picks up new role claims. */
export async function idToken(force = false): Promise<string | null> {
  const user = auth().currentUser;
  return user ? user.getIdToken(force) : null;
}

export async function startPhoneSignIn(phoneE164: string): Promise<FirebaseAuthTypes.ConfirmationResult> {
  return auth().signInWithPhoneNumber(phoneE164);
}

export async function signOut(): Promise<void> {
  if (auth().currentUser) {
    await auth().signOut();
  }
}

export { auth };
