import { Banner, Card, Loading, Text, useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../lib/api';
import { errorMessage } from '../lib/queryClient';

/** Shows the 6-digit OTP and a short-lived signed QR; the QR is refetched before it expires (120 s TTL). */
export function PickupCode({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const code = useQuery({
    queryKey: ['pickup-code', orderId],
    queryFn: () => api.orders.pickupCode(orderId),
    refetchInterval: 90_000,
    staleTime: 0,
  });
  if (code.isLoading) return <Loading />;
  if (code.error) return <Banner tone="danger">{errorMessage(code.error)}</Banner>;
  const data = code.data!;
  return (
    <Card>
      <Text variant="heading">{t('code.title')}</Text>
      <Text muted>{t('code.instructions')}</Text>
      <Text
        variant="title"
        accessibilityRole="text"
        style={{ letterSpacing: 8, textAlign: 'center', color: theme.colors.primary }}
        testID="pickup-otp"
      >
        {data.otp}
      </Text>
      <View style={{ alignItems: 'center', padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
        <QRCode value={data.qrToken} size={200} />
      </View>
      <Text variant="caption" muted style={{ textAlign: 'center' }}>
        {t('code.refreshing')}
      </Text>
    </Card>
  );
}
