import { Banner, Icon, Row, Skeleton, Text, elevation, useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../lib/api';
import { errorMessage } from '../lib/queryClient';

const QR_TTL_MS = 120_000;

/**
 * The pickup code, laid out like a ticket stub: the 6-digit OTP above a perforation, the signed QR below. The QR
 * is refetched before it expires (120 s TTL) and a thin bar drains to show how long the current one has left.
 */
export function PickupCode({ orderId, notchColor }: { orderId: string; notchColor?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const code = useQuery({
    queryKey: ['pickup-code', orderId],
    queryFn: () => api.orders.pickupCode(orderId),
    refetchInterval: 90_000,
    staleTime: 0,
  });

  if (code.isLoading) {
    return (
      <View style={{ gap: 12, alignItems: 'center', paddingVertical: 8 }} accessibilityLabel={t('common.loading')}>
        <Skeleton width={180} height={36} />
        <Skeleton width={200} height={200} radius={16} />
      </View>
    );
  }
  if (code.error) return <Banner tone="danger">{errorMessage(code.error)}</Banner>;
  const data = code.data!;
  const notch = notchColor ?? theme.colors.background;

  return (
    <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1,
      borderColor: theme.colors.border, ...elevation(theme, 1) }}>
      <View style={{ padding: 20, alignItems: 'center', gap: 6 }}>
        <Text variant="overline" muted>{t('code.title')}</Text>
        <Text
          variant="display"
          accessibilityRole="text"
          accessibilityLabel={`${t('code.title')}: ${data.otp.split('').join(' ')}`}
          selectable
          style={{ letterSpacing: 10, color: theme.colors.primary, fontVariant: ['tabular-nums'], paddingLeft: 10 }}
          testID="pickup-otp"
        >
          {data.otp}
        </Text>
      </View>

      <Perforation notch={notch} line={theme.colors.borderStrong} />

      <View style={{ padding: 20, paddingTop: 16, alignItems: 'center', gap: 14 }}>
        <View style={{ padding: 14, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}
              accessible accessibilityLabel={t('code.qrLabel')}>
          <QRCode value={data.qrToken} size={188} color="#1C1A17" backgroundColor="#FFFFFF" />
        </View>
        <QrLife key={data.qrToken} expiresAt={data.qrExpiresAt} />
        <Row gap={2} align="flex-start" style={{ alignSelf: 'stretch', backgroundColor: theme.colors.primarySoft,
          borderRadius: theme.radius.md, padding: 12 }}>
          <Icon as={ShieldCheck} size={18} color="onPrimarySoft" />
          <Text variant="caption" style={{ flex: 1, color: theme.colors.onPrimarySoft }}>{t('code.instructions')}</Text>
        </Row>
      </View>
    </View>
  );
}

/** Dashed tear line with half-circle notches cut into each edge. */
function Perforation({ notch, line }: { notch: string; line: string }) {
  return (
    <View style={{ height: 20, justifyContent: 'center' }} accessible={false}>
      <View style={{ position: 'absolute', left: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: notch }} />
      <View style={{ position: 'absolute', right: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: notch }} />
      <View style={{ marginHorizontal: 18, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: line }} />
    </View>
  );
}

/** A bar that drains as the current QR approaches expiry; remounted (via key) for every fresh token. */
function QrLife({ expiresAt }: { expiresAt: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [remainingMs] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  const life = useRef(new Animated.Value(Math.min(1, remainingMs / QR_TTL_MS))).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const run = Animated.timing(life, { toValue: 0, duration: remainingMs, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [life, remainingMs]);
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 6 }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ width: 120, height: 3, borderRadius: 2, backgroundColor: theme.colors.sunken, overflow: 'hidden' }}>
        <Animated.View style={{ height: 3, backgroundColor: theme.colors.primary,
          width: life.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }} />
      </View>
      <Text variant="caption" muted center>{t('code.refreshing')}</Text>
    </View>
  );
}
