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
  name: isProd ? 'LunchBox Partner' : `LunchBox Partner (${env})`,
  slug: 'lunchbox-partner',
  owner: 'bhargavvzz',
  scheme: 'lunchboxpartner',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: process.env.EAS_UPDATE_URL },
  ios: {
    bundleIdentifier: isProd ? 'in.lunchbox.partner' : `in.lunchbox.partner.${env}`,
    googleServicesFile: ifPresent(process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist'),
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
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#16201D' },
    package: isProd ? 'in.lunchbox.partner' : `in.lunchbox.partner.${env}`,
    googleServicesFile: ifPresent(process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'),
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
    // The camera scans QR codes and takes photos; no microphone, broad media access or overlays.
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_AUDIO'],
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
    ['expo-camera', { cameraPermission: 'The camera scans pickup QR codes and takes handover photos.', recordAudioAndroid: false }],
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#16201D',
      dark: { image: './assets/splash-icon.png', backgroundColor: '#0E1513' } }],
    ['expo-build-properties', {
      ios: { useFrameworks: 'static' },
      android: { minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36, enableProguardInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true },
    }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: env,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080',
    wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://10.0.2.2:8080/ws',
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '5db5ec21-1d2f-488d-91e3-a9124ce1e3e9' },
  },
});
