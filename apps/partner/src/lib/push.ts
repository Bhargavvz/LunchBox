import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { api } from './api';

export async function registerForPush(): Promise<void> {
  const status = await messaging().requestPermission();
  if (status !== messaging.AuthorizationStatus.AUTHORIZED && status !== messaging.AuthorizationStatus.PROVISIONAL) return;
  const token = await messaging().getToken();
  await api.notifications.registerDevice({ token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', app: 'PARTNER' });
}
