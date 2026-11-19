import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * A Firebase config file path, or undefined when the file is absent. Expo refuses to load the whole config if a
 * listed file is missing, which would block Android development on a machine without the iOS plist (and vice versa).
 */
function ifPresent(path: string): string | undefined {
  return existsSync(resolve(__dirname, path)) ? path : undefined;
}

const env = process.env.APP_ENV ?? 'development';
const isProd = env === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'LunchBox' : `LunchBox (${env})`,
  slug: 'lunchbox-parent',
  owner: 'bhargavvzz',
  scheme: 'lunchbox',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: process.env.EAS_UPDATE_URL },
  ios: {
    bundleIdentifier: isProd ? 'in.lunchbox.parent' : `in.lunchbox.parent.${env}`,
    googleServicesFile: ifPresent(process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist'),
    supportsTablet: false,
    config: { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'LunchBox uses your location only to place your home pin when you add a pickup address.',
      NSCameraUsageDescription: 'Not used by the parent app.',
    },
  },
  android: {
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1D4F47' },
    package: isProd ? 'in.lunchbox.parent' : `in.lunchbox.parent.${env}`,
    googleServicesFile: ifPresent(process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'),
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'CAMERA'],
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    ['expo-location', { locationWhenInUsePermission: 'LunchBox uses your location to place your home pin.' }],
    // Profile photo: camera or gallery, compressed on the phone before upload.
    ['expo-image-picker', {
      photosPermission: 'LunchBox uses your photos so you can choose a profile picture.',
      cameraPermission: 'LunchBox uses the camera so you can take a profile picture.',
      microphonePermission: false,
    }],
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#1D4F47',
      dark: { image: './assets/splash-icon.png', backgroundColor: '#0E1513' } }],
    ['expo-build-properties', { ios: { useFrameworks: 'static' }, android: { minSdkVersion: 24 } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: env,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080',
    wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://10.0.2.2:8080/ws',
    useFakePayments: process.env.EXPO_PUBLIC_FAKE_PAYMENTS === 'true',
    policyVersion: '2026-10',
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '4b27923e-4fdf-434f-80e3-6b5965a13721' },
  },
});
