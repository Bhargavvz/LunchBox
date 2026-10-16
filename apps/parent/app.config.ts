import type { ConfigContext, ExpoConfig } from 'expo/config';

const env = process.env.APP_ENV ?? 'development';
const isProd = env === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'LunchBox' : `LunchBox (${env})`,
  slug: 'lunchbox-parent',
  scheme: 'lunchbox',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: process.env.EAS_UPDATE_URL },
  ios: {
    bundleIdentifier: isProd ? 'in.lunchbox.parent' : `in.lunchbox.parent.${env}`,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
    supportsTablet: false,
    config: { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'LunchBox uses your location only to place your home pin when you add a pickup address.',
      NSCameraUsageDescription: 'Not used by the parent app.',
    },
  },
  android: {
    package: isProd ? 'in.lunchbox.parent' : `in.lunchbox.parent.${env}`,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    ['expo-location', { locationWhenInUsePermission: 'LunchBox uses your location to place your home pin.' }],
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    ['expo-build-properties', { ios: { useFrameworks: 'static' }, android: { minSdkVersion: 24 } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: env,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080',
    wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://10.0.2.2:8080/ws',
    useFakePayments: process.env.EXPO_PUBLIC_FAKE_PAYMENTS === 'true',
    policyVersion: '2026-10',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
