import messaging, { type FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { api } from './api';
import { queryClient } from './queryClient';

export async function registerForPush(): Promise<void> {
  const status = await messaging().requestPermission();
  if (status !== messaging.AuthorizationStatus.AUTHORIZED && status !== messaging.AuthorizationStatus.PROVISIONAL) return;
  const token = await messaging().getToken();
  await api.notifications.registerDevice({ token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', app: 'PARTNER' });
}

/** Partner notifications are all about today's route, so every tap opens it with fresh data. */
function open(message: FirebaseMessagingTypes.RemoteMessage | null, navigate: (href: string) => void): void {
  if (!message) return;
  const { notificationId } = message.data ?? {};
  if (typeof notificationId === 'string') {
    void api.notifications.markRead(notificationId).catch(() => undefined);
  }
  void queryClient.invalidateQueries({ queryKey: ['route'] });
  navigate('/(tabs)');
}

/** Call once the session is ready so the auth gate does not override the navigation. */
export function bindNotificationTaps(navigate: (href: string) => void): () => void {
  void messaging().getInitialNotification().then((m) => open(m, navigate));
  const offOpened = messaging().onNotificationOpenedApp((m) => open(m, navigate));
  const offForeground = messaging().onMessage(() => {
    void queryClient.invalidateQueries({ queryKey: ['route'] });
  });
  return () => {
    offOpened();
    offForeground();
  };
}
