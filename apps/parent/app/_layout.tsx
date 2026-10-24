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
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="children/new" options={{ title: t('children.add'), presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="children/[childId]" options={{ title: t('children.edit') }} />
      <Stack.Screen name="addresses/index" options={{ title: t('address.title') }} />
      <Stack.Screen name="addresses/new" options={{ title: t('address.add') }} />
      <Stack.Screen name="subscribe/[childId]" options={{ title: t('subscribe.title') }} />
      <Stack.Screen name="orders/[orderId]" options={{ title: t('track.title') }} />
      <Stack.Screen name="orders/history" options={{ title: t('account.orders') }} />
      <Stack.Screen name="payments/index" options={{ title: t('payments.title') }} />
      <Stack.Screen name="payments/[paymentId]" options={{ title: t('payments.invoice') }} />
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
            <AuthGate />
            <Navigator />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
