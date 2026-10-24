import '../src/lib/locationTask';
import '../src/i18n';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Loading, ThemeProvider, ToastProvider, useTheme } from '@lunchbox/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { realtime } from '../src/lib/api';
import { bindConnectivity, useActionQueue } from '../src/lib/offlineQueue';
import { bindNotificationTaps, registerForPush } from '../src/lib/push';
import { queryClient } from '../src/lib/queryClient';
import { bindAuthState, useSession } from '../src/lib/session';

function Gate() {
  const status = useSession((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => bindAuthState(), []);
  useEffect(() => bindConnectivity(), []);

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0];
    if (status === 'signedOut' && group !== '(auth)') router.replace('/(auth)/sign-in');
    else if (status === 'notApproved' && segments[0] !== 'not-approved') router.replace('/not-approved');
    else if (status === 'ready' && (group === '(auth)' || group === 'not-approved')) router.replace('/(tabs)');
  }, [status, segments, router]);

  useEffect(() => {
    if (status !== 'ready') return;
    realtime.connect();
    void registerForPush();
    void useActionQueue.getState().flush();
    const unbindTaps = bindNotificationTaps((href) => router.push(href as never));
    return () => {
      unbindTaps();
      void realtime.disconnect();
    };
  }, [status, router]);

  return null;
}

function Navigator() {
  const { t } = useTranslation();
  const theme = useTheme();
  const status = useSession((s) => s.status);
  if (status === 'loading') return <Loading safeTop label={t('common.loading')} />;
  return (
    <Stack
      screenOptions={{
        headerBackTitle: t('common.back'),
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontFamily: theme.fonts.semibold, fontSize: 17 },
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="not-approved" options={{ headerShown: false }} />
      <Stack.Screen name="stop/[stopId]" options={{ title: t('stop.title') }} />
      <Stack.Screen name="scan/[orderId]" options={{ title: t('scan.title'), headerTransparent: true, headerTintColor: '#FFFFFF' }} />
      <Stack.Screen name="handover/[schoolId]" options={{ title: t('handover.title') }} />
      <Stack.Screen name="issue" options={{ title: t('issue.title'), presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  // Fonts ship inside the binary, so this resolves within a frame or two; a load failure falls back to system type.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style="auto" />
            <Gate />
            <Navigator />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
