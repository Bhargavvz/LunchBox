import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { api } from './api';

/** Asks for notification permission and registers the FCM token with the backend (idempotent). */
export async function registerForPush(): Promise<void> {
  const status = await messaging().requestPermission();
  const enabled =
    status === messaging.AuthorizationStatus.AUTHORIZED || status === messaging.AuthorizationStatus.PROVISIONAL;
  if (!enabled) return;
  const token = await messaging().getToken();
  await api.notifications.registerDevice({
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    app: 'PARENT',
  });
}

export function onTokenRefresh(): () => void {
  return messaging().onTokenRefresh((token) => {
    void api.notifications.registerDevice({ token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', app: 'PARENT' });
  });
}

export async function unregisterPush(): Promise<void> {
  try {
    const token = await messaging().getToken();
    await api.notifications.unregisterDevice(token);
    await messaging().deleteToken();
  } catch {
    // Best effort on sign-out.
  }
}
