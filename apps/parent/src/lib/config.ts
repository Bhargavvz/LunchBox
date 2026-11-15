import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface Extra {
  appEnv: string;
  apiUrl: string;
  wsUrl: string;
  useFakePayments: boolean;
  policyVersion: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

/**
 * 10.0.2.2 is how the Android emulator reaches the PC. The same .env also drives the browser preview, where that
 * address does not exist, so web builds read it as localhost.
 */
function forPlatform(url: string): string {
  return Platform.OS === 'web' ? url.replace('//10.0.2.2', '//localhost') : url;
}


export const config: Extra = {
  appEnv: extra.appEnv ?? 'development',
  apiUrl: forPlatform(extra.apiUrl ?? 'http://10.0.2.2:8080'),
  wsUrl: forPlatform(extra.wsUrl ?? 'ws://10.0.2.2:8080/ws'),
  useFakePayments: extra.useFakePayments ?? false,
  policyVersion: extra.policyVersion ?? '2026-10',
};
