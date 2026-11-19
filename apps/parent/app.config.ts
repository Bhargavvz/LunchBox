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

// Classes Expo loads by name (Class.forName): the headless app loader that runs background tasks, the task
// manager and the location task consumer. expo-task-manager ships these rules but does not apply them to apps.
const EXPO_REFLECTION_RULES = [
  '-keep class expo.modules.adapters.react.apploader.** { *; }',
  '-keep class * extends expo.modules.apploader.HeadlessAppLoader { *; }',
  '-keep class expo.modules.taskManager.** { *; }',
  '-keep class expo.modules.location.taskConsumers.** { *; }',
  '-keep class * implements expo.modules.interfaces.taskManager.TaskConsumerInterface { *; }',
];

const env = process.env.APP_ENV ?? 'development';
const isProd = env === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'LunchBox' : `LunchBox (${env})`,
  slug: 'lunchbox-parent',
  owner: 'bhargavvzz',
  scheme: 'lunchbox',
  version: '1.0.0',
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
    // Not needed: background location (only the rider app tracks), microphone, broad media access (the system photo
    // picker needs none) and overlays. Keeps the Play data-safety and permissions declarations minimal.
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION', 'android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_AUDIO'],
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
    ['expo-build-properties', {
      ios: { useFrameworks: 'static' },
      // Play requires a recent target API; R8 shrinks and obfuscates release builds (Razorpay needs its keep rules).
      android: { minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36, enableProguardInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true, extraProguardRules: [
  ...EXPO_REFLECTION_RULES,
  '-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }',
  '-keepattributes JavascriptInterface',
  '-keepattributes *Annotation*',
  '-dontwarn com.razorpay.**',
  '-keep class com.razorpay.** { *; }',
  '-optimizations !method/inlining/*',
  '-keepclasseswithmembers class * { public void onPayment*(...); }',
].join('\n') },
    }],
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
