import '../src/i18n';
import { Loading, ThemeProvider } from '@lunchbox/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { realtime } from '../src/lib/api';
import { bindNotificationTaps, onTokenRefresh, registerForPush } from '../src/lib/push';
import { queryClient } from '../src/lib/queryClient';
import { bindAuthState, useSession } from '../src/lib/session';

function AuthGate() {
  const status = useSession((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => bindAuthState(), []);

  useEffect(() => {
    const group = segments[0];
    if (status === 'loading') return;
    if (status === 'signedOut' && group !== '(auth)') router.replace('/(auth)/sign-in');
    else if (status === 'needsRegistration' && segments[1] !== 'register') router.replace('/(onboarding)/register');
    else if (status === 'needsConsent' && segments[1] !== 'consent') router.replace('/(onboarding)/consent');
    else if (status === 'ready' && (group === '(auth)' || group === '(onboarding)')) router.replace('/(tabs)');
  }, [status, segments, router]);

  useEffect(() => {
    if (status !== 'ready') return;
    void registerForPush();
    realtime.connect();
    const unsubscribe = onTokenRefresh();
    const unbindTaps = bindNotificationTaps((href) => router.push(href as never));
    return () => {
      unsubscribe();
      unbindTaps();
      void realtime.disconnect();
    };
  }, [status, router]);

  return null;
}

export default function RootLayout() {
  const { t } = useTranslation();
  const status = useSession((s) => s.status);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <AuthGate />
          {status === 'loading' ? (
            <Loading />
          ) : (
            <Stack screenOptions={{ headerBackTitle: t('common.cancel') }}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="children/new" options={{ title: t('children.add') }} />
              <Stack.Screen name="children/[childId]" options={{ title: t('children.title') }} />
              <Stack.Screen name="addresses/index" options={{ title: t('address.title') }} />
              <Stack.Screen name="addresses/new" options={{ title: t('address.add') }} />
              <Stack.Screen name="subscribe/[childId]" options={{ title: t('subscribe.title') }} />
              <Stack.Screen name="orders/[orderId]" options={{ title: t('track.title') }} />
              <Stack.Screen name="orders/history" options={{ title: t('account.orders') }} />
              <Stack.Screen name="payments/index" options={{ title: t('payments.title') }} />
              <Stack.Screen name="payments/[paymentId]" options={{ title: t('payments.invoice') }} />
            </Stack>
          )}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
