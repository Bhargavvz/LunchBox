import type { ConfigContext, ExpoConfig } from 'expo/config';

const env = process.env.APP_ENV ?? 'development';
const isProd = env === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'LunchBox Partner' : `LunchBox Partner (${env})`,
  slug: 'lunchbox-partner',
  scheme: 'lunchboxpartner',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: process.env.EAS_UPDATE_URL },
  ios: {
    bundleIdentifier: isProd ? 'in.lunchbox.partner' : `in.lunchbox.partner.${env}`,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
    supportsTablet: false,
    config: { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY },
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription: 'Your location is shared with parents and operations only during an active delivery route.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'LunchBox keeps sharing your location while your delivery route is active, even when the app is in the background. Tracking stops when the route ends.',
      NSCameraUsageDescription: 'The camera scans pickup QR codes and takes the school handover photo.',
    },
  },
  android: {
    package: isProd ? 'in.lunchbox.partner' : `in.lunchbox.partner.${env}`,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'LunchBox shares your location only while your delivery route is active.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-camera', { cameraPermission: 'The camera scans pickup QR codes and takes handover photos.' }],
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    ['expo-build-properties', { ios: { useFrameworks: 'static' }, android: { minSdkVersion: 24 } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: env,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080',
    wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://10.0.2.2:8080/ws',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
