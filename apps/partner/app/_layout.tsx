import '../src/lib/locationTask';
import '../src/i18n';
import { Loading, ThemeProvider } from '@lunchbox/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
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

export default function RootLayout() {
  const status = useSession((s) => s.status);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <Gate />
          {status === 'loading' ? (
            <Loading />
          ) : (
            <Stack>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="not-approved" options={{ headerShown: false }} />
              <Stack.Screen name="stop/[stopId]" options={{ title: 'Stop' }} />
              <Stack.Screen name="scan/[orderId]" options={{ title: 'Scan QR' }} />
              <Stack.Screen name="handover/[schoolId]" options={{ title: 'Handover' }} />
              <Stack.Screen name="issue" options={{ title: 'Report issue', presentation: 'modal' }} />
            </Stack>
          )}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
