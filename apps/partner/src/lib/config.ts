import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<{ appEnv: string; apiUrl: string; wsUrl: string }>;

/**
 * 10.0.2.2 is how the Android emulator reaches the PC. The same .env also drives the browser preview, where that
 * address does not exist, so web builds read it as localhost.
 */
function forPlatform(url: string): string {
  return Platform.OS === 'web' ? url.replace('//10.0.2.2', '//localhost') : url;
}


export const config = {
  appEnv: extra.appEnv ?? 'development',
  apiUrl: forPlatform(extra.apiUrl ?? 'http://10.0.2.2:8080'),
  wsUrl: forPlatform(extra.wsUrl ?? 'ws://10.0.2.2:8080/ws'),
};
