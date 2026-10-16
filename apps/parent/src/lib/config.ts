import Constants from 'expo-constants';

interface Extra {
  appEnv: string;
  apiUrl: string;
  wsUrl: string;
  useFakePayments: boolean;
  policyVersion: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const config: Extra = {
  appEnv: extra.appEnv ?? 'development',
  apiUrl: extra.apiUrl ?? 'http://10.0.2.2:8080',
  wsUrl: extra.wsUrl ?? 'ws://10.0.2.2:8080/ws',
  useFakePayments: extra.useFakePayments ?? false,
  policyVersion: extra.policyVersion ?? '2026-10',
};
