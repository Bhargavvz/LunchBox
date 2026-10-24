import messaging, { type FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { api } from './api';
import { queryClient } from './queryClient';

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

type PushData = Record<string, string | object> | undefined;

/** Where a tapped notification should take the parent. Exported for tests. */
export function pushTarget(data: PushData): string | null {
  if (!data) return null;
  if (typeof data.orderId === 'string') return `/orders/${data.orderId}`;
  if (typeof data.broadcastId === 'string') return '/(tabs)/notifications';
  return null;
}

function open(message: FirebaseMessagingTypes.RemoteMessage | null, navigate: (href: string) => void): void {
  if (!message) return;
  const { notificationId } = message.data ?? {};
  if (typeof notificationId === 'string') {
    void api.notifications.markRead(notificationId).catch(() => undefined);
  }
  const target = pushTarget(message.data);
  if (target) navigate(target);
}

/**
 * Deep-links notification taps (cold start and background) and refreshes the inbox for foreground messages.
 * Call once the session is ready so the auth gate does not override the navigation.
 */
export function bindNotificationTaps(navigate: (href: string) => void): () => void {
  void messaging().getInitialNotification().then((m) => open(m, navigate));
  const offOpened = messaging().onNotificationOpenedApp((m) => open(m, navigate));
  const offForeground = messaging().onMessage(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  });
  return () => {
    offOpened();
    offForeground();
  };
}
