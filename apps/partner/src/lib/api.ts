import { createLunchBoxApi, createRealtime } from '@lunchbox/api-client';
import i18n from '../i18n';
import { config } from './config';
import { idToken, signOut } from './firebase';

export const api = createLunchBoxApi({
  baseUrl: config.apiUrl,
  getToken: () => idToken(),
  getLanguage: () => i18n.language,
  onUnauthorized: () => void signOut(),
});

export const realtime = createRealtime({
  url: config.wsUrl,
  getToken: () => idToken(),
  reactNative: true,
});
