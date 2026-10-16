import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<{ appEnv: string; apiUrl: string; wsUrl: string }>;

export const config = {
  appEnv: extra.appEnv ?? 'development',
  apiUrl: extra.apiUrl ?? 'http://10.0.2.2:8080',
  wsUrl: extra.wsUrl ?? 'ws://10.0.2.2:8080/ws',
};
